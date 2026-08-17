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
      if (claimed.length === 0) {
        return { grounded: true, reason: "no numeric claims to check" };
      }

      const supported = new Set(numericTokens(sources));
      const invented = claimed.filter((t) => !supported.has(t));

      if (invented.length === 0) {
        return {
          grounded: true,
          reason: `all ${claimed.length} numeric claims appear in the cited sources`,
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
 * Numbers, percentages, money, dates and quarters, as whole tokens.
 *
 * Whole tokens rather than substrings on purpose: matching "5" inside "2025" would
 * mark almost anything as supported, and a judge that never fails is not a check,
 * it is decoration.
 */
function numericTokens(text: string): string[] {
  const tokens = new Set<string>();

  // 24, 0.6, 14,400.00, 08:14:00, 2026-02-09, 20%, 2xx
  // The lookbehind keeps "Q3" from also registering a bare "3", which made the
  // failure message read `states "3", "4", "q3", "q4"` for a single invented quarter.
  for (const m of text.matchAll(/(?<![Qq])\d[\d,.:x-]*%?/gi)) {
    const token = m[0].replace(/[.,:-]+$/, "");
    if (token !== "") tokens.add(token.toLowerCase());
  }

  // Q3, Q4 — a roadmap date with no digit-run of its own.
  for (const m of text.matchAll(/\bQ[1-4]\b/gi)) {
    tokens.add(m[0].toLowerCase());
  }

  return [...tokens];
}
