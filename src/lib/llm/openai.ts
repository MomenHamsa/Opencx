import OpenAI from "openai";
import type { LLMProvider, LLMRequest, LLMResponse } from "@/lib/types";

/**
 * The OpenAI provider.
 *
 * The second real adapter, and the reason `LLMProvider` is an interface rather than
 * a convenience. Nothing above this file knows which vendor answered: the agent
 * builds the same prompt, the same parser reads the output, the same validator
 * rejects it, and the same harness grades it. Swapping vendors is a dropdown, and
 * the exam is what tells you whether the swap cost you anything.
 *
 * Worth noticing next to `real.ts`: this adapter *forwards* `temperature`, while the
 * Anthropic one must strip it or the request 400s. Same interface, opposite
 * behaviour — which is the whole argument for having an adapter layer instead of
 * calling an SDK from the agent.
 */

/**
 * Deliberately conservative. `gpt-4o-mini` is cheap and broadly available, which
 * makes it the right default for iterating on prompts and tests.
 *
 * I am not going to pretend to know which model is newest on your account — that
 * changes faster than any hardcoded list stays true. `npm run models` asks your key
 * what it can actually reach; set OPENAI_MODEL to whatever you want from that list.
 */
const DEFAULT_MODEL = "gpt-4o-mini";

export function isOpenAIConfigured(): boolean {
  return (process.env.OPENAI_API_KEY ?? "").trim() !== "";
}

export function openAIModel(): string {
  const configured = (process.env.OPENAI_MODEL ?? "").trim();
  return configured === "" ? DEFAULT_MODEL : configured;
}

/**
 * Reasoning-family models reject `temperature` and rename `max_tokens` to
 * `max_completion_tokens`. The prefix test is a best guess at a moving target, so it
 * is a hint rather than the safety net — `complete()` below recovers from being
 * wrong by reading the API's own error.
 */
function looksLikeReasoningModel(model: string): boolean {
  return /^o\d/i.test(model) || /^gpt-5/i.test(model);
}

export function createOpenAIProvider(modelOverride?: string): LLMProvider {
  if (!isOpenAIConfigured()) {
    throw new Error("OPENAI_API_KEY is not set. Add it to .env and restart.");
  }

  const model = (modelOverride ?? "").trim() === "" ? openAIModel() : (modelOverride as string).trim();
  const client = new OpenAI(); // reads OPENAI_API_KEY from the environment

  return {
    name: "openai",
    model,
    async complete(req: LLMRequest): Promise<LLMResponse> {
      const startedAt = Date.now();
      const maxTokens = req.maxTokens ?? 4000;

      const messages = [
        { role: "system" as const, content: req.system },
        { role: "user" as const, content: req.user },
      ];

      // Attempt the shape the model family is expected to want, then let the API
      // correct me. Parameter support shifts between model generations, and a
      // wrong guess should cost one retry rather than an unexplained 400 in the
      // middle of an eval run.
      const attempts: Record<string, unknown>[] = looksLikeReasoningModel(model)
        ? [{ max_completion_tokens: maxTokens }, { max_tokens: maxTokens }]
        : [
            { max_tokens: maxTokens, temperature: req.temperature ?? 0 },
            { max_completion_tokens: maxTokens },
          ];

      let lastError: unknown;
      for (const extra of attempts) {
        try {
          const response = await client.chat.completions.create({
            model,
            messages,
            ...extra,
          });

          const choice = response.choices[0];

          // A content filter or a length cut-off both produce a usable-looking
          // response with unusable content. Surfacing it as an error means the
          // agent degrades to a safe escalation with the reason in the trace,
          // rather than handing the parser an empty string.
          if (choice?.finish_reason === "content_filter") {
            throw new Error("response blocked by the provider's content filter");
          }

          return {
            text: choice?.message?.content ?? "",
            usage: {
              promptTokens: response.usage?.prompt_tokens ?? 0,
              completionTokens: response.usage?.completion_tokens ?? 0,
            },
            latencyMs: Date.now() - startedAt,
          };
        } catch (err: unknown) {
          lastError = err;
          // Only a parameter complaint is worth retrying. Anything else — a bad
          // key, a rate limit, a missing model — will fail identically the second
          // time, and retrying would just double the wait.
          if (!isUnsupportedParameterError(err)) throw err;
        }
      }

      throw lastError instanceof Error ? lastError : new Error(String(lastError));
    },
  };
}

function isUnsupportedParameterError(err: unknown): boolean {
  if (!(err instanceof OpenAI.APIError) || err.status !== 400) return false;
  const message = String(err.message).toLowerCase();
  return (
    message.includes("unsupported") ||
    message.includes("not supported") ||
    message.includes("unrecognized") ||
    message.includes("max_tokens") ||
    message.includes("temperature")
  );
}

/**
 * Ask the key what it can actually reach. Used by `npm run models`, because a
 * hardcoded list of model ids goes stale and this does not.
 */
export async function listOpenAIModels(): Promise<string[]> {
  const client = new OpenAI();
  const ids: string[] = [];
  for await (const model of client.models.list()) ids.push(model.id);
  return ids.sort();
}
