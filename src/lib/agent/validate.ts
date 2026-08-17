import {
  ACTIONS,
  INTENTS,
  URGENCIES,
  type Action,
  type AgentOutput,
  type Intent,
  type Urgency,
} from "@/lib/types";

/**
 * Schema validation for model output, hand-written.
 *
 * No validation library, on purpose. This is ~70 lines, it is the boundary between
 * a language model and a customer, and it is the code I most need to be able to
 * explain without saying "the library does that". Swapping it for zod is a one-file
 * change if the team prefers one — the return type is what the rest of the code
 * depends on, not the mechanism.
 *
 * Every error is collected rather than thrown on the first miss, because a trace
 * that says "intent invalid, confidence out of range, citations not an array" is
 * debuggable and one that says "intent invalid" is a guessing game.
 */

export type ValidationResult =
  | { ok: true; value: AgentOutput }
  | { ok: false; errors: string[] };

export function validateAgentOutput(input: unknown): ValidationResult {
  const errors: string[] = [];

  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, errors: ["output is not a JSON object"] };
  }
  const raw = input as Record<string, unknown>;

  const intent = requireEnum<Intent>(raw.intent, INTENTS, "intent", errors);
  const urgency = requireEnum<Urgency>(raw.urgency, URGENCIES, "urgency", errors);
  const action = requireEnum<Action>(raw.action, ACTIONS, "action", errors);

  const confidence = raw.confidence;
  if (typeof confidence !== "number" || Number.isNaN(confidence)) {
    errors.push(`confidence must be a number, got ${describe(confidence)}`);
  } else if (confidence < 0 || confidence > 1) {
    // Not clamped. A model returning 95 instead of 0.95 has misunderstood the scale,
    // and silently rescaling it hides that from every downstream decision.
    errors.push(`confidence must be between 0 and 1, got ${confidence}`);
  }

  const reply = raw.reply;
  if (typeof reply !== "string") {
    errors.push(`reply must be a string, got ${describe(reply)}`);
  } else if (reply.trim() === "") {
    errors.push("reply is empty");
  }

  const citations = raw.citations;
  if (!Array.isArray(citations)) {
    errors.push(`citations must be an array, got ${describe(citations)}`);
  } else if (!citations.every((c): c is string => typeof c === "string")) {
    errors.push("citations must contain only strings");
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      intent: intent as Intent,
      urgency: urgency as Urgency,
      action: action as Action,
      confidence: confidence as number,
      reply: (reply as string).trim(),
      citations: citations as string[],
    },
  };
}

/**
 * Citations must point at articles the agent was actually shown.
 *
 * Separate from schema validation because it is a different kind of wrong. A
 * malformed field is a broken model call. A well-formed citation of an article that
 * was never retrieved is the model quoting something it half-remembers — which is
 * how a customer ends up reading a confident reference to a help page that does not
 * apply to them, or does not exist.
 */
export function checkCitationsAreReal(
  output: AgentOutput,
  retrievedIds: string[],
): string[] {
  return output.citations.filter((id) => !retrievedIds.includes(id));
}

function requireEnum<T extends string>(
  value: unknown,
  allowed: readonly string[],
  field: string,
  errors: string[],
): T | undefined {
  if (typeof value !== "string") {
    errors.push(`${field} must be a string, got ${describe(value)}`);
    return undefined;
  }
  if (!allowed.includes(value)) {
    errors.push(`${field} "${value}" is not one of: ${allowed.join(", ")}`);
    return undefined;
  }
  return value as T;
}

/** Short, safe description of a bad value for the error message. */
function describe(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return typeof value;
}
