import type { BaselineDiff, EvalRun } from "@/lib/types";

/**
 * What changed since the baseline. Pure — no filesystem — so the browser can
 * recompute it after promoting a new baseline without a round trip.
 *
 * `regressed` is the number that matters. A prompt change that fixes four tickets and
 * breaks one is not a four-ticket win, and the whole reason to run an exam rather than
 * spot-check two examples is to see the one.
 */
export function diffAgainstBaseline(current: EvalRun, baseline: EvalRun): BaselineDiff {
  const before = new Map(baseline.rows.map((r) => [r.ticketId, r.passed]));

  const fixed: string[] = [];
  const regressed: string[] = [];
  const stillFailing: string[] = [];
  const notInBaseline: string[] = [];

  for (const row of current.rows) {
    const was = before.get(row.ticketId);
    if (was === undefined) notInBaseline.push(row.ticketId);
    else if (!was && row.passed) fixed.push(row.ticketId);
    else if (was && !row.passed) regressed.push(row.ticketId);
    else if (!was && !row.passed) stillFailing.push(row.ticketId);
  }

  return {
    baselineRunId: baseline.runId,
    baselinePromptVersion: baseline.promptVersion,
    baselinePassed: baseline.passed,
    baselineTotal: baseline.total,
    fixed,
    regressed,
    stillFailing,
    notInBaseline,
  };
}
