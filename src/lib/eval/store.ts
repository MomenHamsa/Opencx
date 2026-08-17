import fs from "node:fs/promises";
import path from "node:path";
import { BASELINE_FILE, RUNS_DIR } from "@/lib/config";
import type { EvalRun } from "@/lib/types";

/**
 * Eval run persistence. Server-side only — touches the filesystem.
 *
 * The baseline is one saved run, promoted by hand. Explicitly promoted rather than
 * "whatever ran last", because a baseline that moves on its own cannot tell you
 * anything: every run would compare clean and every regression would be invisible.
 *
 * The diff itself lives in `diff.ts` because it is pure and the browser needs it too.
 */

export { diffAgainstBaseline } from "@/lib/eval/diff";

/** Run ids reach this module from request bodies, so they are validated as filenames. */
const SAFE_ID = /^[A-Za-z0-9._-]+$/;

export async function saveRun(run: EvalRun): Promise<void> {
  await fs.mkdir(RUNS_DIR, { recursive: true });
  await fs.writeFile(path.join(RUNS_DIR, `${run.runId}.json`), JSON.stringify(run, null, 2), "utf8");
}

export async function loadRun(runId: string): Promise<EvalRun | null> {
  if (!SAFE_ID.test(runId)) return null;
  try {
    return JSON.parse(await fs.readFile(path.join(RUNS_DIR, `${runId}.json`), "utf8")) as EvalRun;
  } catch {
    return null;
  }
}

/**
 * The most recent saved run for a prompt version, or null.
 *
 * Sorted by the run's own `createdAt` rather than by file mtime — copying the data
 * directory around should not silently change which run is considered current.
 */
export async function latestRunForVersion(promptVersion: string): Promise<EvalRun | null> {
  let files: string[];
  try {
    files = (await fs.readdir(RUNS_DIR)).filter((f) => f.endsWith(".json"));
  } catch {
    return null;
  }

  const runs: EvalRun[] = [];
  for (const file of files) {
    try {
      const run = JSON.parse(await fs.readFile(path.join(RUNS_DIR, file), "utf8")) as EvalRun;
      if (run.promptVersion === promptVersion) runs.push(run);
    } catch {
      // A half-written or hand-edited file should not take the page down.
    }
  }

  runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return runs[0] ?? null;
}

export async function saveBaseline(run: EvalRun): Promise<void> {
  await fs.mkdir(path.dirname(BASELINE_FILE), { recursive: true });
  await fs.writeFile(BASELINE_FILE, JSON.stringify(run, null, 2), "utf8");
}

export async function loadBaseline(): Promise<EvalRun | null> {
  try {
    return JSON.parse(await fs.readFile(BASELINE_FILE, "utf8")) as EvalRun;
  } catch {
    // No baseline yet is the normal state on a fresh checkout, not an error.
    return null;
  }
}
