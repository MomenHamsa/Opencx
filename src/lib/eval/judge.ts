import { extractJsonObject } from "@/lib/agent/parse";
import type { LLMProvider } from "@/lib/types";

/**
 * The grounding judge.
 *
 * Every other check is deterministic. This one is not, because the failure it looks
 * for cannot be pattern-matched: a fluent, confident, well-formatted claim that
 * nothing in the evidence supports. That is the failure that actually burns
 * customers, and it is invisible to exact matching — the reply looks great.
 */

export interface GroundingVerdict {
  grounded: boolean;
  /** What was unsupported, specifically. Goes straight into the failed row. */
  reason: string;
  /**
   * The judge could not reach a verdict — it errored, or returned something
   * unreadable. Distinct from `grounded: false` on purpose: "I could not check
   * this" is not the same claim as "this is wrong", and reporting one as the other
   * is how a flaky judge quietly becomes a fake failure.
   */
  unavailable?: boolean;
}

export interface Judge {
  readonly name: string;
  judgeGrounding(reply: string, sources: string): Promise<GroundingVerdict>;
}

/**
 * The offline judge: a specificity check, not a model. Be precise about what this is
 * when asked, because the gap matters.
 *
 * It extracts every numeric specific from the reply — figures, percentages, dates,
 * money, quarters — and asks whether each one appears anywhere in the evidence the
 * agent was given. A number the agent produced that exists nowhere in its sources is
 * a number it made up.
 *
 * Why numbers: an invented specific is the expensive kind of ungrounded claim.
 * "Refunds take 5 to 10 business days", "targeted for Q3", "a 20% discount" — these
 * are the sentences a customer acts on, forwards to their boss, and holds you to.
 *
 * What it misses, honestly: an ungrounded claim with no number in it. "We are fully
 * GDPR compliant and all of our sub-processors are located within the EEA" sails
 * straight through, and that is a genuinely dangerous sentence. Catching it needs a
 * real model, which is what the LLM judge in `createLLMJudge` is for. The mock judge
 * exists so the harness runs offline, not because it is as good.
 */
export function createSpecificityJudge(): Judge {
  return {
    name: "mock-specificity",
    async judgeGrounding(reply: string, sources: string): Promise<GroundingVerdict> {
      const claimed = numericTokens(reply);
      if (claimed.size === 0) {
        return { grounded: true, reason: "no numeric claims to check" };
      }

      // Compare on the canonical form only. Comparing raw forms too would report
      // "80,000" as invented even when the source says "80k" — the same number,
      // and the exact false positive a real run surfaced.
      const supported = numericTokens(sources);
      const invented = [...claimed.entries()]
        .filter(([canonical]) => !supported.has(canonical))
        .map(([, original]) => original);

      if (invented.length === 0) {
        return {
          grounded: true,
          reason: `all ${claimed.size} numeric claims appear in the cited sources`,
        };
      }

      return {
        grounded: false,
        reason: `states ${invented.map((t) => `"${t}"`).join(", ")}, which appears nowhere in the retrieved articles or tool results`,
      };
    },
  };
}

/**
 * Numeric claims in the text, as a map from canonical form to the original spelling.
 *
 * Canonical so that "80k", "80,000" and "80000" compare equal; original so the
 * failure message quotes what was actually written. Whole tokens rather than
 * substrings, because matching "5" inside "2025" would mark almost anything as
 * supported, and a judge that never fails is decoration rather than a check.
 */
function numericTokens(text: string): Map<string, string> {
  const tokens = new Map<string, string>();
  const add = (canonical: string, original: string): void => {
    if (!tokens.has(canonical)) tokens.set(canonical, original);
  };

  // 24, 0.6, 14,400.00, 08:14:00, 2026-02-09, 20%, 2xx, 80k
  // The lookbehind keeps "Q3" from also registering a bare "3", which made the
  // failure message read `states "3", "4", "q3", "q4"` for a single invented quarter.
  for (const m of text.matchAll(/(?<![Qq])\d[\d,.:x-]*%?k?\b/gi)) {
    const token = m[0].replace(/[.,:-]+$/, "");
    if (token === "") continue;
    add(normaliseNumber(token) ?? token.toLowerCase(), token);
  }

  // Q3, Q4 — a roadmap date with no digit-run of its own.
  for (const m of text.matchAll(/\bQ[1-4]\b/gi)) {
    add(m[0].toLowerCase(), m[0]);
  }

  return tokens;
}

/**
 * "80,000" and "80k" to a single canonical "80000".
 *
 * Patching around formatting like this is exactly the argument for the model judge:
 * every fix here is one more special case, and the next one will be "eighty
 * thousand" spelled out, which no regex is going to catch.
 */
function normaliseNumber(token: string): string | null {
  const match = /^(\d[\d,]*(?:\.\d+)?)(k?)$/i.exec(token);
  if (match === null) return null;

  const value = Number(match[1]?.replace(/,/g, "") ?? "");
  if (Number.isNaN(value)) return null;

  return String(match[2]?.toLowerCase() === "k" ? value * 1000 : value);
}

// ---------------------------------------------------------------------------
// The model judge
// ---------------------------------------------------------------------------

const JUDGE_SYSTEM = `You are grading one support reply for grounding. This is the only question you answer.

A reply is grounded when every factual claim it makes is supported by the evidence provided. Factual claims are things like prices, dates, timeframes, limits, policies, product behaviour, and statements about what did or will happen to this customer's account.

The following are NOT ungrounded, and must not be penalised:
- Greetings, apologies, and offers to help further.
- Saying the question is being passed to a colleague or a specialist team.
- Saying that the help centre does not cover something.
- Restating the customer's own question back to them.

Judge only what is written. Do not reward or punish tone, length, or formatting, and do not speculate about what the agent might have meant.

Respond with JSON only, nothing before or after it:
{"grounded": true|false, "reason": "<one sentence naming the specific unsupported claim, or confirming all claims are supported>"}`;

/**
 * A real model grading the grounding check.
 *
 * This is the check that cannot be pattern-matched — a fluent, confident,
 * well-formatted claim that nothing in the evidence supports. The offline
 * specificity judge catches invented *numbers*; it sails straight past "we are
 * fully GDPR compliant and all of our sub-processors are in the EEA", which is the
 * sentence that actually costs you a customer.
 *
 * Two honest caveats to keep in view:
 *
 *  - **Cost.** This is one extra model call per graded row, so a 50-test suite is
 *    100 calls, not 50. It is a deliberate choice in the UI, not the default.
 *  - **Self-preference.** Judging a model's output with the same model is a known
 *    weakness — it tends to like its own work. Set JUDGE_MODEL to something
 *    stronger than the agent's model when the verdict matters.
 */
export function createLLMJudge(provider: LLMProvider): Judge {
  return {
    name: `llm-judge:${provider.model}`,
    async judgeGrounding(reply: string, sources: string): Promise<GroundingVerdict> {
      const user = `<evidence>
${sources.trim() === "" ? "(no evidence was retrieved for this ticket)" : sources}
</evidence>

<reply>
${reply}
</reply>`;

      try {
        const response = await provider.complete({
          system: JUDGE_SYSTEM,
          user,
          temperature: 0,
          maxTokens: 1000,
        });

        // The judge's own output is model output, so it gets the same distrust as
        // the agent's: extract, then check the shape, never JSON.parse directly.
        const parsed = extractJsonObject(response.text);
        if (parsed === null || typeof parsed !== "object") {
          return unavailable("judge returned output that could not be parsed");
        }

        const raw = parsed as Record<string, unknown>;
        if (typeof raw.grounded !== "boolean") {
          return unavailable("judge response had no boolean `grounded` field");
        }

        return {
          grounded: raw.grounded,
          reason: typeof raw.reason === "string" && raw.reason.trim() !== ""
            ? raw.reason.trim()
            : raw.grounded
              ? "judged grounded"
              : "judged ungrounded, no reason given",
        };
      } catch (err: unknown) {
        // A rate limit or a network blip is not evidence the reply was wrong.
        return unavailable(
          `judge call failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
  };
}

function unavailable(reason: string): GroundingVerdict {
  return { grounded: true, reason, unavailable: true };
}
