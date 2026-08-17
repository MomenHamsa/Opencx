/**
 * Milestone 2 smoke check: `npm run m2`.
 *
 * Two questions. Does one ticket produce a saved trace file with everything in it?
 * And does the agent survive model output designed to break it — because "never
 * crash on model output" is a claim, and a claim I have not tried to falsify is
 * just a comment.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { runAgent } from "@/lib/agent/run";
import { TRACES_DIR } from "@/lib/config";
import { GOLDEN_CASES } from "@/lib/golden/cases";
import { createMockProvider } from "@/lib/llm/mock";
import { getPromptVersion } from "@/lib/prompt/versions";
import { createKeywordRetriever } from "@/lib/retrieval/keyword";
import { createKeywordRetriever as makeRetriever } from "@/lib/retrieval/keyword";
import type { LLMProvider, LLMRequest, LLMResponse, Trace } from "@/lib/types";

/**
 * A provider that returns exactly the kinds of output that break naive parsers.
 * Every one of these is something a real model does: chats before the JSON, wraps it
 * in a fence, invents a field value, gets the confidence scale wrong, cites an
 * article it was never shown, or simply falls over.
 */
function createChaosProvider(mode: string): LLMProvider {
  const bodies: Record<string, string> = {
    prose_around_json: `Of course! Here is my assessment:

{"intent":"integration_issue","urgency":"normal","action":"reply","confidence":0.8,"reply":"Your token needs admin rights.","citations":["kb-zendesk-connect"]}

Hope that helps!`,
    fenced_json: `\`\`\`json
{"intent":"integration_issue","urgency":"normal","action":"reply","confidence":0.8,"reply":"Your token needs admin rights.","citations":["kb-zendesk-connect"]}
\`\`\``,
    braces_in_reply: `{"intent":"integration_issue","urgency":"normal","action":"reply","confidence":0.8,"reply":"The customer wrote {\\"foo\\": \\"bar\\"} in their ticket, and said \\"it broke\\".","citations":["kb-zendesk-connect"]}`,
    not_json_at_all: `I'm sorry, I can't help with that request.`,
    truncated: `{"intent":"integration_issue","urgency":"normal","action":"reply","confidence":0.8,"reply":"Your token`,
    bad_enum: `{"intent":"refund_request","urgency":"normal","action":"reply","confidence":0.8,"reply":"Hello.","citations":[]}`,
    confidence_as_percent: `{"intent":"integration_issue","urgency":"normal","action":"reply","confidence":85,"reply":"Hello.","citations":[]}`,
    empty_reply: `{"intent":"integration_issue","urgency":"normal","action":"reply","confidence":0.8,"reply":"   ","citations":[]}`,
    fabricated_citation: `{"intent":"integration_issue","urgency":"normal","action":"reply","confidence":0.9,"reply":"See our article on SLA credits.","citations":["kb-sla-credits"]}`,
  };

  return {
    name: `chaos:${mode}`,
    model: "chaos",
    async complete(_req: LLMRequest): Promise<LLMResponse> {
      if (mode === "provider_throws") throw new Error("ECONNRESET: socket hang up");
      return {
        text: bodies[mode] ?? "",
        usage: { promptTokens: 100, completionTokens: 20 },
        latencyMs: 1,
      };
    },
  };
}

async function main(): Promise<void> {
  const prompt = getPromptVersion("v1");
  if (prompt === undefined) throw new Error("prompt v1 missing");
  const retriever = createKeywordRetriever();
  const ticket = GOLDEN_CASES[0]?.ticket;
  if (ticket === undefined) throw new Error("golden set is empty");

  // --- 1. One real run, end to end -----------------------------------------
  const trace = await runAgent({
    ticket,
    prompt,
    provider: createMockProvider(),
    retriever,
  });

  console.log(`\nTRACE ${trace.traceId}\n`);
  console.log(`  ticket        ${trace.ticket.id} — ${trace.ticket.subject}`);
  console.log(`  prompt        ${trace.promptVersion}`);
  console.log(`  provider      ${trace.provider} / ${trace.model}`);
  console.log(`  latency       ${trace.latencyMs}ms`);
  console.log(`  tokens        ${trace.usage.promptTokens} in / ${trace.usage.completionTokens} out`);
  console.log(`  degraded      ${trace.degraded}${trace.degraded ? ` — ${trace.degradedReason}` : ""}`);
  console.log(`\n  retrieved`);
  for (const r of trace.retrieved) {
    console.log(`    ${String(r.score).padStart(7)}  ${r.articleId}  [${r.matchedTerms.slice(0, 6).join(" ")}]`);
  }
  console.log(`\n  tool calls`);
  for (const c of trace.toolCalls) {
    console.log(`    ${c.name} (${c.durationMs}ms) -> ${JSON.stringify(c.output).slice(0, 90)}`);
  }
  console.log(`\n  output`);
  console.log(`    intent=${trace.output.intent} urgency=${trace.output.urgency} action=${trace.output.action} confidence=${trace.output.confidence}`);
  console.log(`    citations=[${trace.output.citations.join(", ")}]`);
  console.log(`\n  reply as the customer would read it:\n`);
  console.log(indent(trace.output.reply, "    "));

  const file = path.join(TRACES_DIR, `${trace.traceId}.json`);
  const stat = await fs.stat(file);
  console.log(`\n  saved to ${path.relative(process.cwd(), file)} (${stat.size} bytes)\n`);

  // --- 2. Hostile model output ---------------------------------------------
  console.log("HOSTILE MODEL OUTPUT — the agent must never throw\n");
  console.log("  mode                     degraded  action     reason");

  const modes = [
    "prose_around_json",
    "fenced_json",
    "braces_in_reply",
    "not_json_at_all",
    "truncated",
    "bad_enum",
    "confidence_as_percent",
    "empty_reply",
    "fabricated_citation",
    "provider_throws",
  ];

  for (const mode of modes) {
    let result: Trace;
    try {
      result = await runAgent({
        ticket,
        prompt,
        provider: createChaosProvider(mode),
        retriever: makeRetriever(),
      });
    } catch (err: unknown) {
      console.log(`  ${mode.padEnd(24)} THREW — ${err instanceof Error ? err.message : String(err)}`);
      process.exitCode = 1;
      continue;
    }

    console.log(
      `  ${mode.padEnd(24)} ${String(result.degraded).padEnd(9)} ${result.output.action.padEnd(10)} ${result.degradedReason || "-"}`,
    );
  }

  console.log("");
}

function indent(text: string, pad: string): string {
  return text
    .split("\n")
    .map((line) => pad + line)
    .join("\n");
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
