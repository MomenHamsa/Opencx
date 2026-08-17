/**
 * Get a JSON object out of whatever the model actually said.
 *
 * Model output is untrusted input. Not hostile-untrusted — untrusted in the boring
 * way that a webhook body is untrusted: it is a string from another system, shaped
 * by a prompt you control only by persuasion. `JSON.parse(response)` is the line of
 * code that takes a support agent down at 2am, because one day the model says
 * "Sure! Here's the JSON:" first, and it has never done that before.
 *
 * Three strategies, cheapest first. Returns null rather than throwing; the caller
 * decides what a failure means, and here it means degrade to a safe escalation.
 */
export function extractJsonObject(raw: string): unknown | null {
  const trimmed = raw.trim();

  // 1. It did what it was told.
  const direct = tryParse(trimmed);
  if (direct !== null) return direct;

  // 2. Markdown fence, with or without a language tag. By far the most common case,
  //    because models are trained on documents where JSON appears inside fences.
  const fence = /```(?:json)?\s*\n?([\s\S]*?)```/i.exec(trimmed);
  if (fence?.[1] !== undefined) {
    const fenced = tryParse(fence[1].trim());
    if (fenced !== null) return fenced;
  }

  // 3. Prose either side of a bare object. Scan for the first balanced {...}.
  const scanned = firstBalancedObject(trimmed);
  if (scanned !== null) return tryParse(scanned);

  return null;
}

function tryParse(text: string): unknown | null {
  if (text === "") return null;
  try {
    const value: unknown = JSON.parse(text);
    // A bare string or number is valid JSON and useless to us.
    return typeof value === "object" && value !== null ? value : null;
  } catch {
    return null;
  }
}

/**
 * Brace counting, but string-aware.
 *
 * A naive indexOf("{") / lastIndexOf("}") breaks the moment a reply contains a brace
 * or a quote — and replies quote customers, who write braces. This tracks whether we
 * are inside a JSON string and whether the previous character was an escape.
 */
function firstBalancedObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  // Unbalanced: the model was cut off mid-object, usually by a token limit.
  return null;
}
