import { randomUUID } from "node:crypto";
import { runAgent } from "@/lib/agent/run";
import { categorise, rowPassed, runChecks } from "@/lib/eval/checks";
import type { Judge } from "@/lib/eval/judge";
import type {
  Article,
  EvalRow,
  EvalRun,
  GoldenCase,
  LLMProvider,
  PromptVersion,
  Retriever,
} from "@/lib/types";

/**
 * The evaluation harness: run the exam, grade it, hand back a score.
 *
 * The eval suite is the test suite. There is no unit-test framework in this repo,
 * and that is a deliberate position rather than a corner cut — for an agent, the
 * behaviour worth protecting is "does it still escalate the DPA request", not "does
 * tokenize() return an array".
 */

export interface EvalOptions {
  prompt: PromptVersion;
  provider: LLMProvider;
  retriever: Retriever;
  judge: Judge;
  /** The exam. Authored content now, so the caller always supplies it. */
  cases: GoldenCase[];
  /** The knowledge base, for resolving the judge's source text. */
  articles: Article[];
}

/**
 * Yields each row as it finishes, so the UI can fill in a table live instead of
 * staring at a spinner for the whole suite. Sequential on purpose: 14 tickets is
 * about a second against the mock, and a real provider needs a rate limiter before
 * it needs concurrency.
 */
export async function* evaluateStream(opts: EvalOptions): AsyncGenerator<EvalRow> {
  for (const gc of opts.cases) {
    const trace = await runAgent({
      ticket: gc.ticket,
      prompt: opts.prompt,
      provider: opts.provider,
      retriever: opts.retriever,
    });

    const checks = await runChecks(trace, gc.expect, opts.judge, opts.articles);
    const passed = rowPassed(checks);

    yield {
      ticketId: gc.ticket.id,
      subject: gc.ticket.subject,
      traceId: trace.traceId,
      passed,
      action: trace.output.action,
      expectedAction: gc.expect.action,
      checks,
      failureCategory: passed ? null : categorise(trace, gc.expect, checks),
      degraded: trace.degraded,
      latencyMs: trace.latencyMs,
    };
  }
}

export function summarise(
  rows: EvalRow[],
  meta: { prompt: PromptVersion; provider: LLMProvider },
): EvalRun {
  return {
    runId: `run_${meta.prompt.id}_${randomUUID().slice(0, 6)}`,
    createdAt: new Date().toISOString(),
    promptVersion: meta.prompt.id,
    provider: meta.provider.name,
    model: meta.provider.model,
    passed: rows.filter((r) => r.passed).length,
    total: rows.length,
    rows,
  };
}

/** Non-streaming convenience: run everything, get the finished report. */
export async function runEvaluation(opts: EvalOptions): Promise<EvalRun> {
  const rows: EvalRow[] = [];
  for await (const row of evaluateStream(opts)) rows.push(row);
  return summarise(rows, opts);
}
