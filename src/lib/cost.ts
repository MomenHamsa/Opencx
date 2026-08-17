import type { TokenUsage } from "@/lib/types";

/**
 * Token pricing, so a run tells you what it cost before the invoice does.
 *
 * Read this table with suspicion. **Token counts are ground truth** — they come back
 * from the provider on every call and are reported exactly. **Dollar figures are an
 * estimate** from the numbers below, which were correct when written and will drift.
 * That is why the UI labels them "est." and why this file is one table rather than
 * prices scattered through the code: when a figure looks wrong, there is exactly one
 * place to correct it.
 *
 * Prices are USD per million tokens. Matching is by longest prefix, so a new
 * `gpt-4o-mini-2026-01-01` inherits `gpt-4o-mini` rather than falling through to
 * nothing.
 */

export const PRICES_UPDATED = "2026-05";

interface Price {
  /** USD per 1M input tokens. */
  in: number;
  /** USD per 1M output tokens. */
  out: number;
}

const PRICE_TABLE: Record<string, Price> = {
  // Anthropic
  "claude-opus-5": { in: 5, out: 25 },
  "claude-opus-4-8": { in: 5, out: 25 },
  "claude-sonnet-5": { in: 3, out: 15 },
  "claude-sonnet-4-6": { in: 3, out: 15 },
  "claude-haiku-4-5": { in: 1, out: 5 },
  "claude-fable-5": { in: 10, out: 50 },

  // OpenAI
  "gpt-4o-mini": { in: 0.15, out: 0.6 },
  "gpt-4o": { in: 2.5, out: 10 },
  "gpt-4.1-mini": { in: 0.4, out: 1.6 },
  "gpt-4.1": { in: 2, out: 8 },
  "o4-mini": { in: 1.1, out: 4.4 },
  "o3-mini": { in: 1.1, out: 4.4 },
  "o3": { in: 2, out: 8 },
};

/** The mock costs nothing, and saying "$0.0000" for it would be noise. */
export function isFreeModel(model: string): boolean {
  return model === "keyword-sim-v1";
}

function priceFor(model: string): Price | null {
  let best: { key: string; price: Price } | null = null;
  for (const [key, price] of Object.entries(PRICE_TABLE)) {
    if (model.startsWith(key) && (best === null || key.length > best.key.length)) {
      best = { key, price };
    }
  }
  return best?.price ?? null;
}

/** Null when the model is not in the table — better than quoting a made-up number. */
export function estimateCostUsd(model: string, usage: TokenUsage): number | null {
  if (isFreeModel(model)) return 0;
  const price = priceFor(model);
  if (price === null) return null;
  return (usage.promptTokens / 1e6) * price.in + (usage.completionTokens / 1e6) * price.out;
}

export function formatUsd(amount: number): string {
  if (amount === 0) return "$0";
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  return `$${amount.toFixed(2)}`;
}

export function sumUsage(entries: (TokenUsage | undefined)[]): TokenUsage {
  return entries.reduce<TokenUsage>(
    (total, u) => ({
      promptTokens: total.promptTokens + (u?.promptTokens ?? 0),
      completionTokens: total.completionTokens + (u?.completionTokens ?? 0),
    }),
    { promptTokens: 0, completionTokens: 0 },
  );
}

export function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}
