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
export function ResultsTable({ rows, running }: { rows: EvalRow[]; running: boolean }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
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
          {rows.map((row) => {
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
        </tbody>
      </table>
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
        className={`cursor-pointer border-b border-line/60 hover:bg-raised ${
          row.passed ? "" : "bg-fail/5"
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
