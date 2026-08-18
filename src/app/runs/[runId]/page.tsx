import Link from "next/link";
import { notFound } from "next/navigation";
import { DiffPanel } from "@/components/eval/DiffPanel";
import { ResultsTable } from "@/components/eval/ResultsTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { formatTokens, formatUsd } from "@/lib/cost";
import { diffAgainstBaseline, loadBaseline, loadRun } from "@/lib/eval/store";

/**
 * One past run, in full.
 *
 * The history table was a scoreboard you could not open — it told you a run scored
 * 9/14 three days ago and gave you no way to ask which three failed. Since a saved
 * run already carries every row and every check, this page is mostly a matter of
 * pointing the existing results table at stored data instead of a live stream.
 *
 * The diff is recomputed against the *current* baseline rather than stored, so this
 * page answers "how does that run look from where we are now", which is the question
 * you actually have when you open it.
 */
export const dynamic = "force-dynamic";

export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;
  const [run, baseline] = await Promise.all([loadRun(runId), loadBaseline()]);
  if (run === null) notFound();

  const diff = baseline === null ? null : diffAgainstBaseline(run, baseline);
  const isBaseline = baseline?.runId === run.runId;

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <Link href="/runs" className="font-mono text-xs text-info hover:underline">
        ← run history
      </Link>

      <div className="mt-3">
        <PageHeader
          title={`${run.promptVersion} — ${run.passed}/${run.total}`}
          aside={
            <span className="font-mono text-[11px] text-faint">
              {isBaseline && <span className="mr-2 text-info">baseline</span>}
              {run.runId}
            </span>
          }
        >
          {run.provider}/{run.model} · {run.createdAt.replace("T", " ").slice(0, 19)}
          {run.usage !== undefined && (
            <>
              {" · "}
              {formatTokens(run.usage.promptTokens + run.usage.completionTokens)} tokens
              {run.estimatedCostUsd !== null && run.estimatedCostUsd !== undefined && (
                <> · est. {formatUsd(run.estimatedCostUsd)}</>
              )}
            </>
          )}
        </PageHeader>
      </div>

      <div className="flex flex-col gap-5">
        <DiffPanel
          diff={diff}
          currentPassed={run.passed}
          currentTotal={run.total}
          currentVersion={run.promptVersion}
        />
        <ResultsTable rows={run.rows} running={false} />
      </div>

      <p className="mt-3 text-xs text-muted">
        Compared against the baseline as it stands now, not as it stood when this ran.
      </p>
    </main>
  );
}
