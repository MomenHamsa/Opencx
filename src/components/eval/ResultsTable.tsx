"use client";

import Link from "next/link";
import { useState } from "react";
import { CategoryBadge, Verdict } from "@/components/ui/badges";
import type { CheckResult, EvalRow } from "@/lib/types";

/**
 * The results table. Rows expand in place to show which checks failed and why.
 *
 * In place rather than on another screen because the question after "T-011 failed"
 * is always "failed how", and making that a navigation step means it gets skipped.
 * The trace link is separate, for when the answer is "I need to see everything".
 */
type Filter = "all" | "failed" | "prompt" | "retrieval" | "degraded";

export function ResultsTable({ rows, running }: { rows: EvalRow[]; running: boolean }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const failed = rows.filter((r) => !r.passed);

  const visible = rows.filter((r) => {
    if (filter === "all") return true;
    if (filter === "failed") return !r.passed;
    return r.failureCategory === filter;
  });

  /**
   * Which check is failing most, across the run.
   *
   * With fourteen tests you can read the table. With a hundred you cannot, and the
   * useful question stops being "which tickets failed" and becomes "what is going
   * wrong" — one broken check across forty tickets is one fix, not forty.
   */
  const checkCounts = new Map<string, number>();
  for (const row of failed) {
    for (const check of row.checks) {
      if (!check.diagnostic && !check.skipped && !check.passed) {
        checkCounts.set(check.name, (checkCounts.get(check.name) ?? 0) + 1);
      }
    }
  }
  const worstChecks = [...checkCounts.entries()].sort((a, b) => b[1] - a[1]);

  const categoryCount = (c: Filter): number =>
    c === "all" ? rows.length : c === "failed" ? failed.length : rows.filter((r) => r.failureCategory === c).length;

  return (
    <div className="flex flex-col gap-3">
      {rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {(["all", "failed", "prompt", "retrieval", "degraded"] as Filter[]).map((f) => {
            const count = categoryCount(f);
            if (count === 0 && f !== "all" && f !== "failed") return null;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded border px-2 py-1 font-mono text-[11px] ${
                  filter === f ? "border-accent bg-accent-soft text-text" : "border-line text-muted hover:bg-raised"
                }`}
              >
                {f} {count}
              </button>
            );
          })}

          {worstChecks.length > 0 && (
            <span className="ml-auto font-mono text-[11px] text-muted">
              failing checks:{" "}
              {worstChecks.map(([name, n]) => `${name} ×${n}`).join(" · ")}
            </span>
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded border border-line">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-line bg-panel text-xs text-muted">
            <Th className="w-20">ticket</Th>
            <Th>subject</Th>
            <Th className="w-20">result</Th>
            <Th className="w-24">action</Th>
            <Th className="w-28">category</Th>
            <Th className="w-20 text-right">latency</Th>
            <Th className="w-16">trace</Th>
          </tr>
        </thead>
        <tbody>
          {visible.map((row) => {
            const isOpen = expanded === row.ticketId;
            return (
              <RowGroup
                key={row.ticketId}
                row={row}
                isOpen={isOpen}
                onToggle={() => setExpanded(isOpen ? null : row.ticketId)}
              />
            );
          })}

          {running && (
            <tr>
              <td colSpan={7} className="px-3 py-2 font-mono text-xs text-muted">
                running… {rows.length} done
              </td>
            </tr>
          )}

          {!running && rows.length === 0 && (
            <tr>
              <td colSpan={7} className="px-3 py-6 text-center text-muted">
                No results yet. Press Run Evaluation.
              </td>
            </tr>
          )}

          {!running && rows.length > 0 && visible.length === 0 && (
            <tr>
              <td colSpan={7} className="px-3 py-6 text-center text-muted">
                Nothing matches the <span className="font-mono">{filter}</span> filter — which
                is usually good news.
              </td>
            </tr>
          )}
        </tbody>
        </table>
      </div>
    </div>
  );
}

function RowGroup({
  row,
  isOpen,
  onToggle,
}: {
  row: EvalRow;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        // A coloured left edge rather than a faint tint: at a glance you can count
        // the failures down the side of the table without reading a word.
        className={`cursor-pointer border-b border-line/60 border-l-2 transition-colors hover:bg-raised ${
          row.passed ? "border-l-transparent" : "border-l-fail bg-fail/[0.06]"
        }`}
      >
        <Td className="font-mono text-xs">{row.ticketId}</Td>
        <Td className="max-w-0 truncate pr-4 text-muted">{row.subject}</Td>
        <Td>
          <Verdict passed={row.passed} />
        </Td>
        <Td className="font-mono text-xs">
          <span className={row.action === row.expectedAction ? "" : "text-fail"}>{row.action}</span>
        </Td>
        <Td>
          <CategoryBadge category={row.failureCategory} />
        </Td>
        <Td className="tnum text-right font-mono text-xs text-muted">{row.latencyMs}ms</Td>
        <Td>
          <Link
            href={`/trace/${row.traceId}`}
            onClick={(e) => e.stopPropagation()}
            className="font-mono text-xs text-info hover:underline"
          >
            open
          </Link>
        </Td>
      </tr>

      {isOpen && (
        <tr className="border-b border-line/60 bg-panel">
          <td colSpan={7} className="px-3 py-3">
            <ChecksList checks={row.checks} />
          </td>
        </tr>
      )}
    </>
  );
}

function ChecksList({ checks }: { checks: CheckResult[] }) {
  return (
    <div className="flex flex-col gap-1">
      {checks.map((c) => {
        const label = c.skipped
          ? "skip"
          : c.diagnostic
            ? c.passed
              ? "diag"
              : "diag!"
            : c.passed
              ? "ok"
              : "FAIL";

        const tone = c.skipped
          ? "text-muted"
          : c.diagnostic
            ? c.passed
              ? "text-muted"
              : "text-info"
            : c.passed
              ? "text-pass"
              : "text-fail";

        return (
          <div key={c.name} className="flex gap-3 font-mono text-xs">
            <span className={`w-12 shrink-0 font-semibold ${tone}`}>{label}</span>
            <span className="w-40 shrink-0 text-text">{c.name}</span>
            <span className="text-muted">{c.detail}</span>
          </div>
        );
      })}
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-3 py-2 font-normal ${className}`}>{children}</th>;
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-1.5 ${className}`}>{children}</td>;
}
