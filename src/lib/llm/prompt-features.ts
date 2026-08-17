/**
 * Which safety rules are present in a system prompt.
 *
 * The mock provider reads these to decide how to behave, which is the only reason
 * v1 and v2 can produce different results offline. The prompt-diff screen also
 * renders them, so "what did v2 actually add" is a checklist rather than a diff
 * the interviewer has to read.
 *
 * This is string matching on my own prompts. It is not prompt analysis, and it
 * would tell you nothing about a prompt written by someone else.
 */
export interface PromptFeatures {
  /** Every claim must trace to a cited article or tool result. */
  groundingRule: boolean;
  /** An explicit list of situations that must go to a human. */
  escalationPolicy: boolean;
  /** Ticket text is data, never instructions. */
  injectionDefence: boolean;
  /** No invented prices, dates, SLAs or roadmap. */
  noInvention: boolean;
  /** Output JSON and nothing else. */
  strictOutput: boolean;
}

export function detectPromptFeatures(system: string): PromptFeatures {
  return {
    groundingRule: /every factual claim|grounded in|supported by a cited/i.test(system),
    escalationPolicy: /escalation policy/i.test(system),
    injectionDefence: /untrusted|data, never instructions/i.test(system),
    noInvention: /do not invent|never invent/i.test(system),
    strictOutput: /json only|nothing before or after/i.test(system),
  };
}

export const FEATURE_LABELS: Record<keyof PromptFeatures, string> = {
  groundingRule: "Grounding rule",
  escalationPolicy: "Escalation policy",
  injectionDefence: "Injection defence",
  noInvention: "No invented facts",
  strictOutput: "Strict JSON output",
};
