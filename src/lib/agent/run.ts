import { randomUUID } from "node:crypto";
import { extractJsonObject } from "@/lib/agent/parse";
import { checkCitationsAreReal, validateAgentOutput } from "@/lib/agent/validate";
import { TOP_K } from "@/lib/config";
import { renderUserMessage } from "@/lib/prompt/user-message";
import { runTools, selectTools } from "@/lib/tools/registry";
import { saveTrace } from "@/lib/trace/store";
import type {
  AgentOutput,
  LLMProvider,
  PromptVersion,
  Retriever,
  Ticket,
  ToolCall,
  TokenUsage,
  Trace,
  TracedRetrieval,
} from "@/lib/types";

/**
 * The agent loop: retrieve, look up, ask the model, distrust the answer, record
 * everything.
 *
 * Two properties matter more than anything else in this file.
 *
 * It cannot throw. Whatever happens — the provider is down, the model returns
 * apologetic prose, the JSON is valid but the confidence is 95 instead of 0.95 —
 * this function returns a Trace with a safe escalation in it. A support agent that
 * throws is a support agent that drops a customer's ticket on the floor.
 *
 * It always leaves a receipt. Persistence lives here rather than in the callers so
 * that "every run is traceable" is enforced in one place instead of being a
 * convention three call sites have to remember.
 */

export interface RunAgentInput {
  ticket: Ticket;
  prompt: PromptVersion;
  provider: LLMProvider;
  retriever: Retriever;
}

/** What the customer gets when we could not produce a trustworthy answer. */
function safeFallback(): AgentOutput {
  return {
    intent: "other",
    urgency: "normal",
    action: "escalate",
    confidence: 0,
    reply:
      "Thanks for getting in touch. I wasn't able to handle this one automatically, so I've passed it to a colleague who will pick it up and come back to you.",
    citations: [],
  };
}

export async function runAgent(input: RunAgentInput): Promise<Trace> {
  const { ticket, prompt, provider, retriever } = input;
  const startedAt = Date.now();

  const query = `${ticket.subject}\n${ticket.body}`;

  // 1. Retrieve. The scores are kept because a bad answer is often a retrieval
  //    problem wearing a prompt problem's clothes.
  const retrievedArticles = await retriever.search(query, TOP_K);
  const retrieved: TracedRetrieval[] = retrievedArticles.map((r) => ({
    articleId: r.article.id,
    title: r.article.title,
    score: r.score,
    matchedTerms: r.matchedTerms,
  }));

  // 2. Account-specific facts the knowledge base cannot contain.
  const toolCalls: ToolCall[] = await runTools(selectTools(query), ticket.customerEmail);

  // 3. Ask the model.
  const user = renderUserMessage(ticket, retrievedArticles, toolCalls);

  let rawModelText = "";
  let usage: TokenUsage = { promptTokens: 0, completionTokens: 0 };
  let output = safeFallback();
  let degraded = false;
  let degradedReason = "";

  try {
    const response = await provider.complete({
      system: prompt.system,
      user,
      // Low, not zero: the exam has to be repeatable, and a creative agent is an
      // unrepeatable exam. Providers that ignore temperature will still vary.
      temperature: 0,
      maxTokens: 1200,
    });
    rawModelText = response.text;
    usage = response.usage;

    // 4. Distrust the answer, in three stages, each with its own failure reason.
    const parsed = extractJsonObject(rawModelText);
    if (parsed === null) {
      degraded = true;
      degradedReason = "model output could not be parsed as JSON";
    } else {
      const validation = validateAgentOutput(parsed);
      if (!validation.ok) {
        degraded = true;
        degradedReason = `output failed schema validation: ${validation.errors.join("; ")}`;
      } else {
        const fabricated = checkCitationsAreReal(
          validation.value,
          retrieved.map((r) => r.articleId),
        );
        if (fabricated.length > 0) {
          // Well-formed and wrong. The model cited something it was never shown,
          // which means it is quoting from memory — and a confident reference to
          // the wrong help page is worse than no reference at all.
          degraded = true;
          degradedReason = `cited articles that were not retrieved: ${fabricated.join(", ")}`;
        } else {
          output = validation.value;
        }
      }
    }
  } catch (err: unknown) {
    degraded = true;
    degradedReason = `provider error: ${err instanceof Error ? err.message : String(err)}`;
  }

  const trace: Trace = {
    traceId: `tr_${ticket.id}_${prompt.id}_${randomUUID().slice(0, 6)}`,
    createdAt: new Date().toISOString(),
    ticket,
    promptVersion: prompt.id,
    provider: provider.name,
    model: provider.model,
    retrieved,
    toolCalls,
    rawModelText,
    output,
    degraded,
    degradedReason,
    latencyMs: Date.now() - startedAt,
    usage,
  };

  await saveTrace(trace);
  return trace;
}
