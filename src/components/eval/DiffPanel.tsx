import type { BaselineDiff } from "@/lib/types";

/**
 * The whole argument of the project in one strip.
 *
 * "Fixed: six tickets. Regressed: none." is the sentence that separates a prompt
 * change you can defend from a prompt change you hope is fine. `regressed` is
 * rendered first-class even when empty, because an empty regression list is only
 * reassuring if you can see that it was actually checked.
 */
export function DiffPanel({
  diff,
  currentPassed,
  currentTotal,
  currentVersion,
}: {
  diff: BaselineDiff | null;
  currentPassed: number;
  currentTotal: number;
  currentVersion: string;
}) {
  if (diff === null) {
    return (
      <div className="rounded border border-line bg-panel px-4 py-3 text-muted">
        No baseline saved yet. Run a version, then press{" "}
        <span className="font-mono text-text">Save as baseline</span> to compare
        everything after it against this run.
      </div>
    );
  }

  const delta = currentPassed - diff.baselinePassed;

  return (
    <div className="rounded border border-line bg-panel px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-mono text-muted">
          {currentVersion} {currentPassed}/{currentTotal}
        </span>
        <span className="text-muted">vs baseline</span>
        <span className="font-mono text-muted">
          {diff.baselinePromptVersion} {diff.baselinePassed}/{diff.baselineTotal}
        </span>
        {delta !== 0 && (
          <span className={`font-mono font-semibold ${delta > 0 ? "text-pass" : "text-fail"}`}>
            {delta > 0 ? "+" : ""}
            {delta}
          </span>
        )}
      </div>

      {!diff.comparable && (
        <div className="mt-2 rounded border border-warn/50 bg-warn/10 px-3 py-2 text-xs text-warn">
          The baseline ran on <span className="font-mono">{diff.baselineProvider}</span> and this
          run on <span className="font-mono">{diff.currentProvider}</span>. Two things changed, so
          fixed and regressed below do not isolate the prompt. Re-baseline on the same model to
          compare prompts.
        </div>
      )}

      <div className="mt-2 flex flex-col gap-1">
        <DiffLine label="Fixed" ids={diff.fixed} tone="text-pass" />
        <DiffLine label="Regressed" ids={diff.regressed} tone="text-fail" />
        <DiffLine label="Still failing" ids={diff.stillFailing} tone="text-muted" />
        {diff.notInBaseline.length > 0 && (
          <DiffLine label="Not in baseline" ids={diff.notInBaseline} tone="text-muted" />
        )}
      </div>
    </div>
  );
}

function DiffLine({ label, ids, tone }: { label: string; ids: string[]; tone: string }) {
  return (
    <div className="flex gap-2 font-mono text-xs">
      <span className="w-28 shrink-0 text-muted">{label}</span>
      <span className={ids.length === 0 ? "text-muted" : tone}>
        {ids.length === 0 ? "none" : ids.join(", ")}
      </span>
    </div>
  );
}
