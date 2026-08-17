import type { BaselineDiff } from "@/lib/types";

/**
 * The whole argument of the tool, in one strip.
 *
 * "Fixed six. Regressed none." is the sentence that separates a prompt change you
 * can defend from one you hope is fine — so it is rendered as counts you can read
 * across the room, with the ticket ids underneath for when you want the detail.
 *
 * Regressed is always shown, even at zero, and always in the same position. An
 * empty regression list is only reassuring if you can see that it was checked; a
 * panel that hides the row when it is empty teaches you to stop looking for it.
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
    if (currentTotal === 0) return null;
    return (
      <div className="rounded border border-dashed border-line px-4 py-3 text-xs text-muted">
        No baseline saved yet. Press{" "}
        <span className="font-mono text-text">Set as baseline</span> to fix this run as the
        reference every later run is measured against.
      </div>
    );
  }

  return (
    <section className="rounded border border-line bg-panel">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line px-4 py-2 font-mono text-[11px]">
        <span className="text-text">
          {currentVersion} {currentPassed}/{currentTotal}
        </span>
        <span className="text-faint">vs baseline</span>
        <span className="text-muted">
          {diff.baselinePromptVersion} {diff.baselinePassed}/{diff.baselineTotal}
        </span>
      </div>

      {!diff.comparable && (
        <p className="border-b border-line bg-warn/10 px-4 py-2 text-xs text-warn">
          Baseline ran on <span className="font-mono">{diff.baselineProvider}</span>, this run on{" "}
          <span className="font-mono">{diff.currentProvider}</span>. Two things changed, so the
          numbers below do not isolate the prompt.
        </p>
      )}

      <div className="grid gap-px bg-line sm:grid-cols-3">
        <Bucket label="Fixed" ids={diff.fixed} tone="pass" />
        <Bucket label="Regressed" ids={diff.regressed} tone="fail" />
        <Bucket label="Still failing" ids={diff.stillFailing} tone="muted" />
      </div>
    </section>
  );
}

function Bucket({
  label,
  ids,
  tone,
}: {
  label: string;
  ids: string[];
  tone: "pass" | "fail" | "muted";
}) {
  const empty = ids.length === 0;
  const countColour = empty
    ? "text-faint"
    : tone === "pass"
      ? "text-pass"
      : tone === "fail"
        ? "text-fail"
        : "text-muted";

  return (
    <div className="bg-panel px-4 py-3">
      <div className="flex items-baseline gap-2">
        <span className={`tnum font-mono text-2xl leading-none font-semibold ${countColour}`}>
          {ids.length}
        </span>
        <span className="eyebrow">{label}</span>
      </div>
      <div className="mt-1.5 font-mono text-[11px] break-words">
        {empty ? (
          <span className="text-faint">none</span>
        ) : (
          <span className={tone === "fail" ? "text-fail" : "text-muted"}>{ids.join(" · ")}</span>
        )}
      </div>
    </div>
  );
}
