import Anthropic from "@anthropic-ai/sdk";
import type { LLMProvider, LLMRequest, LLMResponse } from "@/lib/types";

/**
 * The real provider: Claude, via the official Anthropic SDK.
 *
 * The one dependency in this project that is not React or Next. It is here rather
 * than a hand-rolled fetch because the SDK owns retries, typed errors and API
 * versioning — three things I would otherwise be reimplementing badly at the exact
 * boundary where failures are hardest to debug.
 *
 * Nothing above this file changes when you flip the provider selector. The agent
 * builds the same prompt, the same parser runs on the output, the same schema
 * validation rejects it, and the same harness grades it. That is the point of the
 * `LLMProvider` interface, and it is what makes a v1-vs-v2 comparison meaningful
 * across two different models.
 */

/**
 * Claude Opus 5. Pinned rather than aliased so a trace always says exactly which
 * model produced an answer — "it broke" starts with "on which model?".
 */
const DEFAULT_MODEL = "claude-opus-5";

/**
 * Generous on purpose. On Opus 5 thinking is on by default, and `max_tokens` caps
 * thinking *and* reply together — a limit sized for just the reply truncates the
 * JSON mid-object. A truncated response degrades safely here, but degrading because
 * I mis-set a limit is a self-inflicted failure.
 */
const DEFAULT_MAX_TOKENS = 8000;

/** Whether the real provider can run at all. The UI uses this to enable the option. */
export function isRealProviderConfigured(): boolean {
  return (process.env.ANTHROPIC_API_KEY ?? "").trim() !== "";
}

export function realProviderModel(): string {
  const configured = (process.env.LLM_MODEL ?? "").trim();
  return configured === "" ? DEFAULT_MODEL : configured;
}

export function createAnthropicProvider(): LLMProvider {
  if (!isRealProviderConfigured()) {
    throw new Error("ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add a key.");
  }

  const model = realProviderModel();
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment

  return {
    name: "anthropic",
    model,
    async complete(req: LLMRequest): Promise<LLMResponse> {
      const startedAt = Date.now();

      const response = await client.messages.create({
        model,
        max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
        system: req.system,
        messages: [{ role: "user", content: req.user }],

        // `req.temperature` is deliberately NOT forwarded.
        //
        // Sampling parameters were removed on this model family: sending
        // temperature, top_p or top_k returns a 400. The agent still sets
        // temperature: 0 because the field is part of the provider-neutral
        // interface and other providers honour it — dropping it here is the
        // adapter doing its job, not a bug.
        //
        // Reproducibility comes from low effort and a tightly specified prompt
        // instead. Worth saying plainly: temperature 0 never guaranteed identical
        // outputs on any model either.
        output_config: {
          // Low, because this is classification plus a short grounded reply — not a
          // reasoning problem. Higher effort would buy nothing here and would make a
          // 14-ticket eval run slow enough to be annoying to demo.
          effort: "low",
        },
      });

      // Safety classifiers can decline a request outright. It arrives as a normal
      // 200 with an empty or partial content array, so reading content[0] blindly
      // is how this becomes a confusing crash instead of a clear degraded run.
      if (response.stop_reason === "refusal") {
        throw new Error(
          `model declined the request (${response.stop_details?.category ?? "no category"})`,
        );
      }

      // Text blocks only. Thinking blocks arrive with empty text by default and
      // carry nothing we could show a customer.
      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === "text")
        .map((block) => block.text)
        .join("");

      return {
        // Verbatim, exactly as with the mock. If this truncated because it hit the
        // token cap, the raw text in the trace is what tells you that.
        text,
        usage: {
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
        },
        latencyMs: Date.now() - startedAt,
      };
    },
  };
}
