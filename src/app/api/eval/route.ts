import { createSpecificityJudge } from "@/lib/eval/judge";
import { evaluateStream, summarise } from "@/lib/eval/run";
import { diffAgainstBaseline, loadBaseline, saveRun } from "@/lib/eval/store";
import { createProvider, isProviderId } from "@/lib/llm/factory";
import { getPromptVersion } from "@/lib/prompt/versions";
import { createKeywordRetriever } from "@/lib/retrieval/keyword";
import type { EvalRow } from "@/lib/types";

/**
 * Runs the exam and streams the results back as NDJSON, one row per line.
 *
 * Streaming rather than a single JSON response because the whole suite takes a
 * second against the mock and would take a couple of minutes against a real
 * provider — and a demo where nothing moves for two minutes is a demo where someone
 * asks if it has crashed. Rows appear as they finish.
 *
 * NDJSON rather than server-sent events: one line, one JSON object, parsed with
 * `split("\n")`. No event framing to explain and no library to justify.
 */

// Node runtime, not edge: the trace store writes files with node:fs.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  let body: { promptVersion?: unknown; provider?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const prompt = getPromptVersion(typeof body.promptVersion === "string" ? body.promptVersion : "");
  if (prompt === undefined) {
    return Response.json({ error: "unknown prompt version" }, { status: 400 });
  }

  const providerId = isProviderId(body.provider) ? body.provider : "mock";

  let provider;
  try {
    provider = createProvider(providerId);
  } catch (err: unknown) {
    return Response.json(
      { error: err instanceof Error ? err.message : "provider unavailable" },
      { status: 400 },
    );
  }

  const opts = {
    prompt,
    provider,
    retriever: createKeywordRetriever(),
    judge: createSpecificityJudge(),
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (value: unknown): void => {
        controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
      };

      const rows: EvalRow[] = [];
      try {
        for await (const row of evaluateStream(opts)) {
          rows.push(row);
          send({ type: "row", row });
        }

        const run = summarise(rows, opts);
        await saveRun(run);

        const baseline = await loadBaseline();
        send({
          type: "done",
          run,
          diff: baseline === null ? null : diffAgainstBaseline(run, baseline),
        });
      } catch (err: unknown) {
        // The agent itself cannot throw, so reaching here means something structural
        // broke. Report it in-band rather than dropping the connection, so the UI can
        // say what happened instead of showing a half-finished table forever.
        send({ type: "error", message: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
