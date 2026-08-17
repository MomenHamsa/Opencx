import fs from "node:fs/promises";
import path from "node:path";
import { TRACES_DIR } from "@/lib/config";
import type { Trace } from "@/lib/types";

/**
 * Trace persistence. Server-side only — this module touches the filesystem and must
 * never be imported into a client component.
 *
 * One JSON file per trace, pretty-printed. No database, and not only because the
 * brief says so: the value of a trace is that a human can open it. `cat` and `jq`
 * beat a query when the question is "what did the agent see at 09:14".
 *
 * What this would become at real volume is worth being able to say out loud:
 * object storage keyed by trace id, with the indexable fields (ticket id, prompt
 * version, degraded, score) in a real table. The write path stays the same shape.
 */

/** Trace ids reach this module from URL params, so they are validated as filenames. */
const SAFE_ID = /^[A-Za-z0-9._-]+$/;

export async function saveTrace(trace: Trace): Promise<void> {
  await fs.mkdir(TRACES_DIR, { recursive: true });
  const file = path.join(TRACES_DIR, `${trace.traceId}.json`);
  await fs.writeFile(file, JSON.stringify(trace, null, 2), "utf8");
}

export async function loadTrace(traceId: string): Promise<Trace | null> {
  if (!SAFE_ID.test(traceId)) return null;

  try {
    const raw = await fs.readFile(path.join(TRACES_DIR, `${traceId}.json`), "utf8");
    return JSON.parse(raw) as Trace;
  } catch {
    // Missing or unreadable. A trace that is not there is a normal outcome after
    // someone clears data/, not an error worth crashing a page render over.
    return null;
  }
}

export async function listTraceIds(): Promise<string[]> {
  try {
    const files = await fs.readdir(TRACES_DIR);
    return files.filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));
  } catch {
    return [];
  }
}
