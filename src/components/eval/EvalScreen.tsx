"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DiffPanel } from "@/components/eval/DiffPanel";
import { ResultsTable } from "@/components/eval/ResultsTable";
import { RunProgress } from "@/components/eval/RunProgress";
import { StatTile } from "@/components/eval/StatTile";
import { diffAgainstBaseline } from "@/lib/eval/diff";
import type { ProviderOption } from "@/lib/llm/factory";
import { formatTokens, formatUsd } from "@/lib/cost";
import type { BaselineDiff, EvalRow, EvalRun } from "@/lib/types";

/**
 * Screen 1: run the exam, watch it fill in, compare against the baseline.
 *
 * The streaming is the reason this is a client component. Rows arrive as NDJSON and
 * are appended one at a time, so a run that takes two minutes against a real provider
 * still shows progress from the first second.
 */

export interface PromptOption {
  id: string;
  label: string;
}

type Status = "idle" | "running" | "done" | "error";

export function EvalScreen({
  prompts,
  initialBaseline,
  providers,
  testCount,
  trend,
}: {
  prompts: PromptOption[];
  initialBaseline: EvalRun | null;
  providers: ProviderOption[];
  testCount: number;
  /** Oldest first. Pass rates of recent runs, for the sparkline. */
  trend: { rate: number; label: string }[];
}) {
  const [promptVersion, setPromptVersion] = useState(prompts[prompts.length - 1]?.id ?? "v1");
  const [providerId, setProviderId] = useState("mock");
  const [model, setModel] = useState("");
  const [useModelJudge, setUseModelJudge] = useState(false);
  const [models, setModels] = useState<Record<string, string[]>>({});
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [rows, setRows] = useState<EvalRow[]>([]);
  const [run, setRun] = useState<EvalRun | null>(null);
  const [diff, setDiff] = useState<BaselineDiff | null>(null);
  const [baseline, setBaseline] = useState<EvalRun | null>(initialBaseline);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /**
   * Changing a selector throws away the previous results.
   *
   * Without this, switching the dropdown from v2 to v1 leaves v2's rows on screen
   * while the diff panel relabels them "v1 12/14" — a screenshot that says something
   * false. Stale results shown under a new label are worse than no results.
   */
  function selectPrompt(id: string): void {
    setPromptVersion(id);
    clearResults();
  }

  function selectProvider(id: string): void {
    setProviderId(id);
    setModel("");
    if (id === "mock") setUseModelJudge(false);
    clearResults();
  }

  function clearResults(): void {
    setRows([]);
    setRun(null);
    setDiff(null);
    setError(null);
    setStatus("idle");
    setStartedAt(null);
  }

  // Asked once, so the model dropdown reflects what the key can actually reach
  // rather than a list that goes stale. A failure costs the dropdown, not the run.
  useEffect(() => {
    void fetch("/api/models")
      .then((r) => r.json())
      .then((d: { models?: Record<string, string[]> }) => setModels(d.models ?? {}))
      .catch(() => setModels({}));
  }, []);

  async function runEvaluation(): Promise<void> {
    setStatus("running");
    setStartedAt(Date.now());
    setRows([]);
    setRun(null);
    setDiff(null);
    setError(null);

    try {
      const response = await fetch("/api/eval", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          promptVersion,
          provider: providerId,
          model: model === "" ? undefined : model,
          judge: useModelJudge ? "model" : "heuristic",
        }),
      });

      if (!response.ok || response.body === null) {
        const detail = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(detail?.error ?? `request failed (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      // NDJSON arrives in arbitrary chunks, so a line can straddle two reads. The
      // buffer is what stops a half-parsed row from throwing mid-run.
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.trim() === "") continue;
          handleMessage(JSON.parse(line) as StreamMessage);
        }
      }

      setStatus((s) => (s === "error" ? s : "done"));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }

  function handleMessage(msg: StreamMessage): void {
    if (msg.type === "row") setRows((prev) => [...prev, msg.row]);
    else if (msg.type === "done") {
      setRun(msg.run);
      setDiff(msg.diff);
    } else {
      setError(msg.message);
      setStatus("error");
    }
  }

  async function promoteBaseline(): Promise<void> {
    if (run === null) return;
    setSaving(true);
    try {
      const response = await fetch("/api/baseline", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId: run.runId }),
      });
      const data = (await response.json()) as { baseline?: EvalRun; error?: string };
      if (data.baseline === undefined) throw new Error(data.error ?? "could not save baseline");

      setBaseline(data.baseline);
      // Recomputed rather than refetched: the diff is pure, and after promoting the
      // current run it should immediately read as "no change", which is the correct
      // and slightly surprising answer.
      setDiff(diffAgainstBaseline(run, data.baseline));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const passed = rows.filter((r) => r.passed).length;
  const isLive = providers.find((p) => p.id === providerId)?.live === true;
  const running = status === "running";
  // Shown next to the score so the number has a reference point. A bare "12 / 14"
  // does not tell you whether today went well.
  const delta =
    run !== null && baseline !== null && rows.length > 0 ? passed - baseline.passed : null;

  return (
    <div className="flex flex-col gap-5">
      {/*
        Two cards, not one row. Before this, seven controls, two buttons and the
        score shared a single flex line and nothing said what to press. Settings
        and result are different questions and now look like it: one card you
        configure, one card that answers.
      */}
      <section className="card">
        <div className="flex flex-wrap items-end gap-x-5 gap-y-3 p-4">
          <Field label="prompt">
            <select
              value={promptVersion}
              onChange={(e) => selectPrompt(e.target.value)}
              disabled={running}
              className={selectClass}
            >
              {prompts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id} — {p.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="provider">
            <select
              value={providerId}
              onChange={(e) => selectProvider(e.target.value)}
              disabled={running}
              className={selectClass}
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id} disabled={!p.available}>
                  {p.id} — {p.label}
                </option>
              ))}
            </select>
          </Field>

          {isLive && (models[providerId] ?? []).length > 0 && (
            <Field label="model">
              <select
                value={model}
                onChange={(e) => {
                  setModel(e.target.value);
                  clearResults();
                }}
                disabled={running}
                className={`${selectClass} max-w-[12rem]`}
              >
                <option value="">default</option>
                {(models[providerId] ?? []).map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {isLive && (
            <Field label="grounding judge">
              <label className="flex cursor-pointer items-center gap-2 py-1 text-[13px]">
                <input
                  type="checkbox"
                  checked={useModelJudge}
                  disabled={running}
                  onChange={(e) => {
                    setUseModelJudge(e.target.checked);
                    clearResults();
                  }}
                  className="accent-[var(--color-accent-strong)]"
                />
                <span className={useModelJudge ? "text-text" : "text-muted"}>
                  {useModelJudge ? "model · 2× calls" : "heuristic · free"}
                </span>
              </label>
            </Field>
          )}

          {/* The only filled control on the screen. If you are unsure what to do,
              the saturated thing is the answer. */}
          <button
            onClick={() => void runEvaluation()}
            disabled={running || testCount === 0}
            className="ml-auto rounded-md bg-accent-strong px-5 py-2.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {running ? "running…" : `Run ${testCount} test${testCount === 1 ? "" : "s"}`}
          </button>
        </div>

        {isLive && (
          <p className="border-t border-line px-4 py-2 font-mono text-[11px] text-warn">
            Live model — one API call per test{useModelJudge ? ", doubled by the model judge" : ""},
            billed to your key.
          </p>
        )}

        {testCount === 0 && (
          <p className="border-t border-line px-4 py-2 text-xs text-warn">
            There are no tests to run yet.{" "}
            <Link href="/tests" className="underline">
              Write your first test
            </Link>{" "}
            — it needs an article to cite, so add{" "}
            <Link href="/kb" className="underline">
              knowledge
            </Link>{" "}
            first.
          </p>
        )}
      </section>

      {running && <RunProgress done={rows.length} total={testCount} startedAt={startedAt} />}

      {error !== null && (
        <div className="rounded-md border border-fail/50 bg-fail/10 px-4 py-3 font-mono text-xs text-fail">
          {error}
        </div>
      )}

      {/* The answer. One hero figure, per the stat-tile spec — before this, five
          large numbers competed and none of them won. */}
      {rows.length > 0 && (
        <section className="flex flex-wrap items-end gap-x-10 gap-y-4 card px-5 py-4">
          <StatTile
            hero
            label="Passing"
            value={
              <>
                <span className={passed === rows.length ? "text-pass" : "text-text"}>{passed}</span>
                <span className="text-faint"> / {rows.length}</span>
              </>
            }
            delta={delta}
            sub={
              delta !== null && baseline !== null
                ? `${Math.round((passed / rows.length) * 100)}% · vs baseline ${baseline.promptVersion} (${baseline.passed}/${baseline.total})`
                : `${Math.round((passed / rows.length) * 100)}% of tests`
            }
            trend={trend}
          />

          <div className="font-mono text-[11px] text-muted">
            <div>{run !== null ? `${run.provider}/${run.model}` : "…"}</div>
            {run?.usage !== undefined && (
              <div className="text-faint">
                {formatTokens(run.usage.promptTokens + run.usage.completionTokens)} tokens
                {run.estimatedCostUsd !== null && run.estimatedCostUsd !== undefined && (
                  <> · est. {formatUsd(run.estimatedCostUsd)}</>
                )}
              </div>
            )}
          </div>

          <button
            onClick={() => void promoteBaseline()}
            disabled={run === null || saving}
            title="Make this the run every future run is compared against"
            className="ml-auto rounded-md border border-line px-3 py-1.5 text-[13px] font-medium text-muted transition-colors hover:border-accent hover:text-text disabled:opacity-40"
          >
            {saving ? "saving…" : "Set as baseline"}
          </button>
        </section>
      )}

      <DiffPanel
        diff={diff}
        currentPassed={passed}
        currentTotal={rows.length}
        currentVersion={promptVersion}
      />

      {/* No results yet is a state, not an empty table. A headerless grid before the
          first run is furniture; this says what to do instead. */}
      {rows.length === 0 && !running ? (
        <div className="card flex flex-col items-center gap-2 px-6 py-14 text-center">
          <p className="text-base font-medium">Nothing scored yet</p>
          <p className="max-w-sm text-muted">
            {testCount === 0
              ? "Add a test and it will show up here."
              : `Press Run ${testCount} tests to score every test against ${promptVersion}, and see it compared to your baseline.`}
          </p>
        </div>
      ) : (
        <ResultsTable rows={rows} running={running} />
      )}
    </div>
  );
}

const selectClass =
  "rounded-md border border-line bg-raised px-2.5 py-1.5 text-[13px] transition-colors hover:border-line-strong focus:border-accent focus:outline-none disabled:opacity-50";

type StreamMessage =
  | { type: "row"; row: EvalRow }
  | { type: "done"; run: EvalRun; diff: BaselineDiff | null }
  | { type: "error"; message: string };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}
