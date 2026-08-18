import { PageHeader } from "@/components/ui/PageHeader";
import Link from "next/link";
import { formatTokens, formatUsd } from "@/lib/cost";
import { Sparkline } from "@/components/eval/Sparkline";
import { listRuns, loadBaseline } from "@/lib/eval/store";

/**
 * Run history.
 *
 * A demo does not need this; a tool you use every week does. The single number on
 * the run screen tells you where you are, and tells you nothing about whether you
 * are getting better — which is the actual question after the second week.
 *
 * Every row records the model as well as the prompt, because a score only means
 * something alongside what produced it.
 */
export const dynamic = "force-dynamic";

export default async function RunsPage() {
  const [runs, baseline] = await Promise.all([listRuns(), loadBaseline()]);

  const trend = [...runs]
    .reverse()
    .filter((r) => r.total > 0)
    .slice(-12)
    .map((r) => ({ rate: r.passed / r.total, label: `${r.promptVersion} ${r.passed}/${r.total}` }));

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <PageHeader
        title="Run history"
        aside={
          trend.length > 1 ? (
            <div className="flex flex-col items-end gap-1">
              <Sparkline points={trend} width={140} height={32} />
              <span className="eyebrow">pass rate, last {trend.length} runs</span>
            </div>
          ) : undefined
        }
      >
        Every evaluation, newest first. A score is only meaningful next to the prompt and the model that produced it.
      </PageHeader>

      {runs.length === 0 ? (
        <p className="rounded border border-line bg-panel px-4 py-6 text-center text-muted">
          No runs saved yet. Runs appear here after you press Run Evaluation.
        </p>
      ) : (
        <div className="overflow-x-auto rounded border border-line">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-line bg-panel text-xs text-muted">
                <th className="w-44 px-3 py-2 font-normal">when</th>
                <th className="w-20 px-3 py-2 font-normal">prompt</th>
                <th className="px-3 py-2 font-normal">model</th>
                <th className="w-24 px-3 py-2 font-normal">score</th>
                <th className="w-28 px-3 py-2 font-normal text-right">tokens</th>
                <th className="w-24 px-3 py-2 font-normal text-right">est. cost</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => {
                const isBaseline = baseline?.runId === run.runId;
                const rate = run.total === 0 ? 0 : run.passed / run.total;
                return (
                  <tr
                    key={run.runId}
                    className="border-b border-line/60 transition-colors hover:bg-raised"
                  >
                    <td className="px-3 py-1.5 font-mono text-[11px] text-muted">
                      <Link href={`/runs/${run.runId}`} className="hover:text-text hover:underline">
                        {run.createdAt.replace("T", " ").slice(0, 19)}
                      </Link>
                      {isBaseline && <span className="ml-2 text-info">baseline</span>}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-xs">{run.promptVersion}</td>
                    <td className="px-3 py-1.5 font-mono text-[11px] text-muted">
                      {run.provider}/{run.model}
                    </td>
                    <td className="tnum px-3 py-1.5 font-mono text-xs">
                      <Link href={`/runs/${run.runId}`} className="hover:underline">
                        <span className={rate === 1 ? "text-pass" : rate < 0.5 ? "text-fail" : ""}>
                          {run.passed}
                        </span>
                        <span className="text-muted">/{run.total}</span>
                      </Link>
                    </td>
                    <td className="tnum px-3 py-1.5 text-right font-mono text-[11px] text-muted">
                      {run.usage === undefined
                        ? "—"
                        : `${formatTokens(run.usage.promptTokens + run.usage.completionTokens)}`}
                    </td>
                    <td className="tnum px-3 py-1.5 text-right font-mono text-[11px] text-muted">
                      {run.estimatedCostUsd === null || run.estimatedCostUsd === undefined
                        ? "—"
                        : formatUsd(run.estimatedCostUsd)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-xs text-muted">
        Runs are JSON under <span className="font-mono">data/runs/</span>. Cost is
        estimated from a local price table, not billed.{" "}
        <Link href="/" className="text-info hover:underline">
          Back to the run screen
        </Link>
      </p>
    </main>
  );
}
