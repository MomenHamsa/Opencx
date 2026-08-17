"use client";

import { useEffect, useState } from "react";
import { DiffPanel } from "@/components/eval/DiffPanel";
import { ResultsTable } from "@/components/eval/ResultsTable";
import { RunProgress } from "@/components/eval/RunProgress";
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
}: {
  prompts: PromptOption[];
  initialBaseline: EvalRun | null;
  providers: ProviderOption[];
  testCount: number;
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

  return (
    <div className="flex flex-col gap-5">
      {/* Controls */}
      <div className="flex flex-wrap items-end gap-4 rounded border border-line bg-panel p-4">
        <Field label="prompt version">
          <select
            value={promptVersion}
            onChange={(e) => selectPrompt(e.target.value)}
            disabled={running}
            className="rounded border border-line bg-raised px-2 py-1 font-mono text-xs disabled:opacity-50"
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
            className="rounded border border-line bg-raised px-2 py-1 font-mono text-xs disabled:opacity-50"
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
              className="max-w-[13rem] rounded border border-line bg-raised px-2 py-1 font-mono text-xs disabled:opacity-50"
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
            <label className="flex items-center gap-2 py-1 font-mono text-xs">
              <input
                type="checkbox"
                checked={useModelJudge}
                disabled={running}
                onChange={(e) => {
                  setUseModelJudge(e.target.checked);
                  clearResults();
                }}
              />
              {/* One extra call per row, so it is opt-in and says so. */}
              <span className={useModelJudge ? "" : "text-muted"}>
                {useModelJudge ? "model (2× calls)" : "heuristic (free)"}
              </span>
            </label>
          </Field>
        )}

        <button
          onClick={() => void runEvaluation()}
          disabled={running}
          className="rounded bg-info px-3 py-1.5 font-mono text-xs font-semibold text-ink hover:opacity-90 disabled:opacity-40"
        >
          {running ? "running…" : "Run Evaluation"}
        </button>

        <button
          onClick={() => void promoteBaseline()}
          disabled={run === null || saving}
          title="Promote this run to the baseline every future run is compared against"
          className="rounded border border-line px-3 py-1.5 font-mono text-xs hover:bg-raised disabled:opacity-40"
        >
          {saving ? "saving…" : "Save as baseline"}
        </button>

        <div className="ml-auto text-right">
          <div className="tnum font-mono text-3xl font-semibold">
            <span className={rows.length === 0 ? "text-muted" : passed === rows.length ? "text-pass" : ""}>
              {passed}
            </span>
            <span className="text-muted"> / {rows.length || "—"}</span>
          </div>
          <div className="font-mono text-[11px] text-muted">
            {run !== null ? `${run.provider}/${run.model}` : "not run yet"}
          </div>
          {/* Tokens are reported by the provider and exact; the dollar figure is an
              estimate from a local price table, so it is labelled as one. */}
          {run?.usage !== undefined && (
            <div className="font-mono text-[11px] text-muted">
              {formatTokens(run.usage.promptTokens)} in ·{" "}
              {formatTokens(run.usage.completionTokens)} out
              {run.estimatedCostUsd !== null && run.estimatedCostUsd !== undefined && (
                <> · est. {formatUsd(run.estimatedCostUsd)}</>
              )}
            </div>
          )}
        </div>
      </div>

      {error !== null && (
        <div className="rounded border border-fail/50 bg-fail/10 px-4 py-3 font-mono text-xs text-fail">
          {error}
        </div>
      )}

      {running && <RunProgress done={rows.length} total={testCount} startedAt={startedAt} />}

      <DiffPanel
        diff={diff}
        currentPassed={passed}
        currentTotal={rows.length}
        currentVersion={promptVersion}
      />

      <ResultsTable rows={rows} running={running} />

      <p className="text-xs text-muted">
        Baseline:{" "}
        {baseline === null ? (
          "none saved"
        ) : (
          <span className="font-mono">
            {baseline.promptVersion} {baseline.passed}/{baseline.total} ({baseline.runId})
          </span>
        )}
        . Click any row to see which checks failed; click <span className="font-mono">open</span> for
        the full trace.
      </p>
    </div>
  );
}

type StreamMessage =
  | { type: "row"; row: EvalRow }
  | { type: "done"; run: EvalRun; diff: BaselineDiff | null }
  | { type: "error"; message: string };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[11px] text-muted">{label}</span>
      {children}
    </label>
  );
}
