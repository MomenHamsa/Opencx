"use client";

import { useEffect, useState } from "react";

/**
 * Progress for a run in flight.
 *
 * Barely mattered against the mock, where the whole suite finishes in about a
 * second. It matters a lot against a real model: at roughly two seconds a test, a
 * fifty-test suite is nearly two minutes of a bar that has to look alive, or someone
 * reaches for the refresh button and loses the run.
 *
 * The estimate is a running mean of completed tests rather than a fixed guess,
 * because per-test latency varies by several hundred milliseconds and an estimate
 * that stops moving reads as broken.
 */
export function RunProgress({
  done,
  total,
  startedAt,
}: {
  done: number;
  total: number;
  startedAt: number | null;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (startedAt === null) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [startedAt]);

  if (startedAt === null || total === 0) return null;

  const elapsed = (now - startedAt) / 1000;
  const fraction = Math.min(done / total, 1);
  const remaining = done > 0 ? (elapsed / done) * (total - done) : null;

  return (
    <div className="flex flex-col gap-1">
      <div className="h-1 overflow-hidden rounded bg-raised">
        <div
          className="h-full bg-accent transition-[width] duration-200"
          style={{ width: `${fraction * 100}%` }}
        />
      </div>
      <div className="tnum flex justify-between font-mono text-[11px] text-muted">
        <span>
          {done} / {total} tests
        </span>
        <span>
          {elapsed.toFixed(0)}s elapsed
          {remaining !== null && remaining > 1 && done < total
            ? ` · ~${remaining.toFixed(0)}s left`
            : ""}
        </span>
      </div>
    </div>
  );
}
