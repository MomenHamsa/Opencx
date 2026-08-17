import Link from "next/link";
import { Verdict } from "@/components/ui/badges";
import { runForVersion } from "@/lib/eval/compare";
import { FEATURE_LABELS, detectPromptFeatures, type PromptFeatures } from "@/lib/llm/prompt-features";
import { PROMPT_VERSIONS } from "@/lib/prompt/versions";
import type { EvalRow, EvalRun, PromptVersion } from "@/lib/types";

/**
 * Screen 3: the two prompts side by side, and what each one actually did.
 *
 * The prompts share almost no lines, so a line-level text diff would render as
 * entirely-deleted next to entirely-added and tell you nothing. The meaningful diff
 * for a prose prompt is *which rules it contains*, so that is the diff shown — with
 * the full text underneath for anyone who wants to read it, and the per-ticket outcome
 * table underneath that, because a rule is only interesting if it changed a result.
 */

export const dynamic = "force-dynamic";

export default async function PromptsPage() {
  const [v1, v2] = [PROMPT_VERSIONS[0], PROMPT_VERSIONS[1]];
  if (v1 === undefined || v2 === undefined) {
    return <main className="p-8 text-muted">Need at least two prompt versions to compare.</main>;
  }

  const [runA, runB] = await Promise.all([runForVersion(v1), runForVersion(v2)]);

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-lg font-semibold">Prompt diff</h1>
        <p className="text-muted">
          What changed between {v1.id} and {v2.id}, and which tickets it moved.
        </p>
      </header>

      <RuleMatrix a={v1} b={v2} />

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        <PromptColumn prompt={v1} run={runA} />
        <PromptColumn prompt={v2} run={runB} />
      </section>

      <OutcomeTable a={runA} b={runB} aId={v1.id} bId={v2.id} />
    </main>
  );
}

/** The actual diff: five rules, present or absent. */
function RuleMatrix({ a, b }: { a: PromptVersion; b: PromptVersion }) {
  const fa = detectPromptFeatures(a.system);
  const fb = detectPromptFeatures(b.system);
  const keys = Object.keys(FEATURE_LABELS) as (keyof PromptFeatures)[];

  return (
    <section className="rounded border border-line bg-panel px-4 py-3">
      <h2 className="mb-2 font-mono text-xs tracking-wide text-muted uppercase">Rules present</h2>
      <div className="grid gap-1">
        {keys.map((key) => (
          <div key={key} className="grid grid-cols-[1fr_3rem_3rem] items-center gap-2 font-mono text-xs">
            <span>{FEATURE_LABELS[key]}</span>
            <RuleMark on={fa[key]} />
            <RuleMark on={fb[key]} />
          </div>
        ))}
        <div className="mt-1 grid grid-cols-[1fr_3rem_3rem] gap-2 font-mono text-[11px] text-muted">
          <span />
          <span>{a.id}</span>
          <span>{b.id}</span>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted">
        This is the diff that matters. A line-level text diff between two prose prompts
        that share no wording renders as one deletion and one addition, which tells you
        nothing.
      </p>
    </section>
  );
}

function RuleMark({ on }: { on: boolean }) {
  return (
    <span className={on ? "text-pass" : "text-muted"}>{on ? "yes" : "no"}</span>
  );
}

function PromptColumn({ prompt, run }: { prompt: PromptVersion; run: EvalRun }) {
  return (
    <div className="rounded border border-line bg-panel">
      <div className="border-b border-line px-4 py-3">
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-sm font-semibold">
            {prompt.id} — {prompt.label}
          </span>
          <span className="tnum font-mono text-lg font-semibold">
            <span className={run.passed > run.total / 2 ? "text-pass" : "text-fail"}>
              {run.passed}
            </span>
            <span className="text-muted">/{run.total}</span>
          </span>
        </div>
      </div>

      {/* The run's own timestamp, because this screen reuses saved runs. Without it,
          editing a prompt and reloading would show the old result with no hint that
          it predates the change. */}
      <div className="border-b border-line px-4 py-2 font-mono text-[11px] text-muted">
        {run.provider}/{run.model} · {run.createdAt}
      </div>

      <div className="border-b border-line px-4 py-3">
        <h3 className="mb-1 font-mono text-[11px] tracking-wide text-muted uppercase">
          changelog
        </h3>
        <pre className="whitespace-pre-wrap font-sans text-xs text-muted">
          {prompt.changelog}
        </pre>
      </div>

      <details className="px-4 py-3">
        <summary className="cursor-pointer font-mono text-[11px] text-muted">
          system prompt — {prompt.system.length} characters
        </summary>
        <pre className="mt-2 overflow-x-auto border-l border-line pl-3 font-mono text-[11px] whitespace-pre-wrap text-muted">
          {prompt.system}
        </pre>
      </details>
    </div>
  );
}

/**
 * Ticket by ticket, v1 result next to v2 result.
 *
 * The `change` column is the one to read. "fixed" and "regressed" are the only two
 * words that matter when reviewing a prompt change; everything else is context.
 */
function OutcomeTable({
  a,
  b,
  aId,
  bId,
}: {
  a: EvalRun;
  b: EvalRun;
  aId: string;
  bId: string;
}) {
  const byId = new Map<string, { a?: EvalRow; b?: EvalRow }>();
  for (const row of a.rows) byId.set(row.ticketId, { ...byId.get(row.ticketId), a: row });
  for (const row of b.rows) byId.set(row.ticketId, { ...byId.get(row.ticketId), b: row });

  const ids = [...byId.keys()].sort();

  return (
    <section className="mt-6">
      <h2 className="mb-2 font-mono text-xs tracking-wide text-muted uppercase">
        Per-ticket outcome
      </h2>
      <div className="overflow-x-auto rounded border border-line">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-line bg-panel text-xs text-muted">
              <th className="w-20 px-3 py-2 font-normal">ticket</th>
              <th className="px-3 py-2 font-normal">subject</th>
              <th className="w-24 px-3 py-2 font-normal">{aId}</th>
              <th className="w-24 px-3 py-2 font-normal">{bId}</th>
              <th className="w-32 px-3 py-2 font-normal">change</th>
              <th className="w-16 px-3 py-2 font-normal">trace</th>
            </tr>
          </thead>
          <tbody>
            {ids.map((id) => {
              const pair = byId.get(id);
              const rowA = pair?.a;
              const rowB = pair?.b;

              const change =
                rowA === undefined || rowB === undefined
                  ? { label: "—", tone: "text-muted" }
                  : !rowA.passed && rowB.passed
                    ? { label: "fixed", tone: "text-pass" }
                    : rowA.passed && !rowB.passed
                      ? { label: "regressed", tone: "text-fail" }
                      : rowB.passed
                        ? { label: "—", tone: "text-muted" }
                        : {
                            label: `still failing · ${rowB.failureCategory ?? ""}`,
                            tone: "text-info",
                          };

              return (
                <tr key={id} className="border-b border-line/60">
                  <td className="px-3 py-1.5 font-mono text-xs">{id}</td>
                  <td className="max-w-0 truncate px-3 py-1.5 pr-4 text-muted">
                    {rowB?.subject ?? rowA?.subject ?? ""}
                  </td>
                  <td className="px-3 py-1.5">
                    {rowA === undefined ? (
                      <span className="text-muted">—</span>
                    ) : (
                      <Verdict passed={rowA.passed} />
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    {rowB === undefined ? (
                      <span className="text-muted">—</span>
                    ) : (
                      <Verdict passed={rowB.passed} />
                    )}
                  </td>
                  <td className={`px-3 py-1.5 font-mono text-xs ${change.tone}`}>
                    {change.label}
                  </td>
                  <td className="px-3 py-1.5">
                    {rowB !== undefined && (
                      <Link
                        href={`/trace/${rowB.traceId}`}
                        className="font-mono text-xs text-info hover:underline"
                      >
                        open
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">
        Both columns use the mock provider. Comparing prompts is only meaningful with the
        provider held fixed.
      </p>
    </section>
  );
}
