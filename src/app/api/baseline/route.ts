import { loadBaseline, loadRun, saveBaseline } from "@/lib/eval/store";

/**
 * Read the saved baseline, or promote a completed run to be it.
 *
 * Promotion takes a run id and reloads the run from disk rather than accepting the
 * run object from the browser. The baseline is the thing every future score is judged
 * against; it should come from what actually ran, not from what a client says ran.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return Response.json({ baseline: await loadBaseline() });
}

export async function POST(request: Request): Promise<Response> {
  let body: { runId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (typeof body.runId !== "string") {
    return Response.json({ error: "runId is required" }, { status: 400 });
  }

  const run = await loadRun(body.runId);
  if (run === null) {
    return Response.json({ error: `no saved run with id ${body.runId}` }, { status: 404 });
  }

  await saveBaseline(run);
  return Response.json({ baseline: run });
}
