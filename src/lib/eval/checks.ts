import { HANDOFF_CONFIDENCE, WEAK_RETRIEVAL_SCORE } from "@/lib/config";
import type { Judge } from "@/lib/eval/judge";
import type { Article, CheckResult, Expectation, FailureCategory, Trace } from "@/lib/types";

/**
 * The seven checks.
 *
 * Six are deterministic and one is a judge. That ratio is the argument for the whole
 * approach: most of what a support agent can get wrong is checkable without another
 * model in the loop, and the one thing that is not — a fluent unsupported claim —
 * is worth the cost and the caveats.
 *
 * A check that cannot be evaluated is `skipped`, not failed. Grading a ticket against
 * an expectation it never had would inflate the failure count with noise, and a score
 * nobody trusts gets ignored.
 */
export async function runChecks(
  trace: Trace,
  expect: Expectation,
  judge: Judge,
  /** The workspace's articles, for resolving the judge's source text. */
  articles: Article[],
): Promise<CheckResult[]> {
  const checks: CheckResult[] = [];
  const { output } = trace;

  // 1. no_degrade — did the run fall back or crash?
  checks.push({
    name: "no_degrade",
    passed: !trace.degraded,
    detail: trace.degraded ? trace.degradedReason : "completed normally",
    diagnostic: false,
    skipped: false,
  });

  // 2. intent — misclassification.
  if (expect.intent === undefined) {
    checks.push(skip("intent", "no intent expectation for this ticket"));
  } else {
    const ok = output.intent === expect.intent;
    checks.push({
      name: "intent",
      passed: ok,
      detail: ok ? `${output.intent}` : `expected ${expect.intent}, got ${output.intent}`,
      diagnostic: false,
      skipped: false,
    });
  }

  // 3. action — replied when it should have escalated, or the reverse.
  {
    const ok = output.action === expect.action;
    checks.push({
      name: "action",
      passed: ok,
      detail: ok ? `${output.action}` : `expected ${expect.action}, got ${output.action}`,
      diagnostic: false,
      skipped: false,
    });
  }

  // 4. citation — replied without pointing at the article that holds the answer.
  if (expect.citesAnyOf === undefined || expect.citesAnyOf.length === 0) {
    checks.push(skip("citation", "no citation expectation (escalation case)"));
  } else {
    const hit = expect.citesAnyOf.some((id) => output.citations.includes(id));
    checks.push({
      name: "citation",
      passed: hit,
      detail: hit
        ? `cited ${output.citations.join(", ")}`
        : output.citations.length === 0
          ? `cited nothing; expected one of ${expect.citesAnyOf.join(", ")}`
          : `cited ${output.citations.join(", ")}; expected one of ${expect.citesAnyOf.join(", ")}`,
      diagnostic: false,
      skipped: false,
    });
  }

  // 5. forbidden_content — a phrase it must never say.
  if (expect.mustNotContain === undefined || expect.mustNotContain.length === 0) {
    checks.push(skip("forbidden_content", "no forbidden phrases for this ticket"));
  } else {
    const lower = output.reply.toLowerCase();
    const leaked = expect.mustNotContain.filter((p) => lower.includes(p.toLowerCase()));
    checks.push({
      name: "forbidden_content",
      passed: leaked.length === 0,
      detail:
        leaked.length === 0
          ? `none of ${expect.mustNotContain.length} forbidden phrases present`
          : `reply contains ${leaked.map((p) => `"${p}"`).join(", ")}`,
      diagnostic: false,
      skipped: false,
    });
  }

  // 6. grounded — the judge.
  //
  // Sources are everything the agent was *shown*, not only what it remembered to
  // cite. Citation discipline is already check 4; making the judge punish it again
  // would turn one mistake into two failures and make the score harder to read.
  {
    const sources = [
      ...trace.retrieved.map((r) => articles.find((a) => a.id === r.articleId)?.body ?? ""),
      ...trace.toolCalls.map((c) => JSON.stringify(c.output)),
    ].join("\n\n");

    const verdict = await judge.judgeGrounding(output.reply, sources);

    // A judge that could not reach a verdict marks the check skipped, not passed
    // and not failed. Counting a rate-limited judge as a grounding failure would
    // invent a regression; counting it as a pass would hide a real one. "We did
    // not check this" is the only honest third answer, and the row shows it.
    checks.push({
      name: "grounded",
      passed: verdict.grounded,
      detail: verdict.reason,
      diagnostic: false,
      skipped: verdict.unavailable === true,
    });
  }

  // 7. retrieval_hit — diagnostic only.
  //
  // It never fails a ticket. Its job is to answer a different question: when this
  // ticket failed, was the right article even in the room? That is the difference
  // between an afternoon of prompt edits and an afternoon well spent.
  if (expect.citesAnyOf === undefined || expect.citesAnyOf.length === 0) {
    checks.push({ ...skip("retrieval_hit", "no expected article"), diagnostic: true });
  } else {
    const ids = trace.retrieved.map((r) => r.articleId);
    const hit = expect.citesAnyOf.some((id) => ids.includes(id));
    const top = trace.retrieved[0];
    checks.push({
      name: "retrieval_hit",
      passed: hit,
      detail: hit
        ? `expected article retrieved${top !== undefined ? ` (top score ${top.score})` : ""}`
        : ids.length === 0
          ? "retrieval returned nothing above the relevance floor"
          : `expected ${expect.citesAnyOf.join(", ")}; retrieved ${ids.join(", ")}`,
      diagnostic: true,
      skipped: false,
    });
  }

  return checks;
}

/** A row passes when every check that counted, passed. */
export function rowPassed(checks: CheckResult[]): boolean {
  return checks.every((c) => c.diagnostic || c.skipped || c.passed);
}

/**
 * Who owns this failure.
 *
 * The brief defines the retrieval category as "the expected article was not in the
 * retrieved set". Building it showed a second retrieval-caused failure that
 * definition misses, so this adds it:
 *
 *   the article *was* retrieved, but so weakly that confidence fell under the handoff
 *   threshold and the agent escalated work it should have answered.
 *
 * Both are cases where editing the prompt is wasted effort. Calling the second one a
 * prompt failure would send someone to rewrite a prompt that is behaving correctly —
 * a correctly cautious agent given bad evidence — which is exactly the wrong-layer
 * mistake the category exists to prevent.
 */
export function categorise(
  trace: Trace,
  expect: Expectation,
  checks: CheckResult[],
): FailureCategory {
  if (trace.degraded) return "degraded";

  const retrievalHit = checks.find((c) => c.name === "retrieval_hit");
  if (retrievalHit !== undefined && !retrievalHit.skipped && !retrievalHit.passed) {
    return "retrieval";
  }

  const topScore = trace.retrieved[0]?.score ?? 0;
  const overEscalatedOnWeakEvidence =
    expect.action === "reply" &&
    trace.output.action === "escalate" &&
    trace.output.confidence < HANDOFF_CONFIDENCE &&
    topScore < WEAK_RETRIEVAL_SCORE;

  if (overEscalatedOnWeakEvidence) return "retrieval";

  return "prompt";
}

function skip(name: CheckResult["name"], detail: string): CheckResult {
  return { name, passed: true, detail, diagnostic: false, skipped: true };
}
