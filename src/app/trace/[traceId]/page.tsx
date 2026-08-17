import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { notFound } from "next/navigation";
import { WEAK_RETRIEVAL_SCORE } from "@/lib/config";
import { findCase, loadWorkspace } from "@/lib/workspace/store";
import { loadTrace } from "@/lib/trace/store";
import type { Trace } from "@/lib/types";

/**
 * Screen 2: the receipt.
 *
 * Everything here is server-rendered from the trace file on disk, and the one
 * interactive element — the collapsible raw model response — is a native <details>.
 * No client JavaScript on this page at all: it is a document about something that
 * already happened.
 */

export const dynamic = "force-dynamic";

export default async function TracePage({
  params,
}: {
  params: Promise<{ traceId: string }>;
}) {
  const { traceId } = await params;
  const trace = await loadTrace(traceId);
  if (trace === null) notFound();

  // The trace does not know what was expected of it — that lives in the golden set.
  // Joining them here is what lets the page say "the article that holds the answer
  // never made it into the retrieved set".
  const expected = findCase(await loadWorkspace(), trace.ticket.id)?.expect;
  const expectedArticles = expected?.citesAnyOf ?? [];
  const retrievedIds = trace.retrieved.map((r) => r.articleId);
  const missingExpected = expectedArticles.filter((id) => !retrievedIds.includes(id));

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <Link href="/" className="font-mono text-xs text-info hover:underline">
        ← eval run
      </Link>

      <PageHeader
        title={`${trace.ticket.id} — ${trace.ticket.subject}`}
        aside={
          <span className="font-mono text-[11px] text-faint">{trace.traceId}</span>
        }
      >
        The full receipt for one answer: what was retrieved, what was looked up, what
        the model actually returned, and what the customer would have read.
      </PageHeader>

      {trace.degraded && (
        <div className="mb-5 rounded border border-fail/50 bg-fail/10 px-4 py-3">
          <div className="font-mono text-xs font-semibold text-fail">DEGRADED</div>
          <p className="mt-1 text-muted">
            The model&apos;s answer was rejected and the run fell back to a safe
            escalation. Reason:{" "}
            <span className="font-mono text-text">{trace.degradedReason}</span>
          </p>
        </div>
      )}

      <Facts trace={trace} />

      <Section title="Ticket">
        <div className="font-mono text-[11px] text-muted">
          {trace.ticket.customerEmail} · {trace.ticket.channel}
        </div>
        <div className="mt-2 font-semibold">{trace.ticket.subject}</div>
        <pre className="mt-1 whitespace-pre-wrap font-sans text-muted">{trace.ticket.body}</pre>
      </Section>

      <Section title={`Retrieved articles (${trace.retrieved.length})`}>
        {missingExpected.length > 0 && (
          <div className="mb-3 rounded border border-info/50 bg-info/10 px-3 py-2 text-xs">
            <span className="font-mono font-semibold text-info">retrieval miss</span> — the
            article that holds the answer,{" "}
            <span className="font-mono">{missingExpected.join(", ")}</span>, is not in this
            set. The agent was never shown it, so no change to the prompt can fix this
            ticket.
          </div>
        )}

        {trace.retrieved.length === 0 && (
          <p className="text-muted">
            Nothing scored above the relevance floor. The agent answered — or escalated —
            with no articles at all.
          </p>
        )}

        <div className="flex flex-col gap-2">
          {trace.retrieved.map((r, i) => {
            const wasCited = trace.output.citations.includes(r.articleId);
            const isExpected = expectedArticles.includes(r.articleId);
            return (
              <div key={r.articleId} className="rounded border border-line bg-raised px-3 py-2">
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span className="tnum font-mono text-xs text-muted">#{i + 1}</span>
                  <span
                    className={`tnum font-mono text-sm font-semibold ${
                      r.score < WEAK_RETRIEVAL_SCORE ? "text-warn" : "text-pass"
                    }`}
                  >
                    {r.score}
                  </span>
                  <span className="font-mono text-xs">{r.articleId}</span>
                  <span className="text-muted">{r.title}</span>
                  {isExpected && (
                    <span className="font-mono text-[11px] text-info">expected</span>
                  )}
                  {wasCited && <span className="font-mono text-[11px] text-pass">cited</span>}
                </div>
                <div className="mt-1 font-mono text-[11px] text-muted">
                  matched: {r.matchedTerms.join(" ") || "—"}
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-2 text-xs text-muted">
          Scores are BM25. Anything below {WEAK_RETRIEVAL_SCORE} is weak enough that the
          agent&apos;s confidence drops with it.
        </p>
      </Section>

      <Section title={`Tool calls (${trace.toolCalls.length})`}>
        <div className="flex flex-col gap-2">
          {trace.toolCalls.map((c, i) => (
            <div key={`${c.name}-${i}`} className="rounded border border-line bg-raised px-3 py-2">
              <div className="flex items-baseline gap-3">
                <span className="font-mono text-xs font-semibold">{c.name}</span>
                <span className="tnum font-mono text-[11px] text-muted">{c.durationMs}ms</span>
                {c.error !== undefined && (
                  <span className="font-mono text-[11px] text-fail">{c.error}</span>
                )}
              </div>
              <div className="mt-1 font-mono text-[11px] text-muted">
                in: {JSON.stringify(c.input)}
              </div>
              <pre className="mt-1 overflow-x-auto font-mono text-[11px] text-muted">
                out: {JSON.stringify(c.output, null, 2)}
              </pre>
            </div>
          ))}
          {trace.toolCalls.length === 0 && <p className="text-muted">No tools were run.</p>}
        </div>
      </Section>

      <Section title="Structured output">
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-xs sm:grid-cols-3">
          <Field k="intent" v={trace.output.intent} />
          <Field k="urgency" v={trace.output.urgency} />
          <Field k="action" v={trace.output.action} />
          <Field k="confidence" v={String(trace.output.confidence)} />
          <Field k="citations" v={trace.output.citations.join(", ") || "none"} />
        </div>
      </Section>

      <Section title="Reply, as the customer would read it">
        <div className="rounded border border-line bg-raised px-4 py-3">
          <pre className="whitespace-pre-wrap font-sans">{trace.output.reply}</pre>
        </div>
      </Section>

      <Section title="Raw model response">
        <details className="rounded border border-line bg-raised">
          <summary className="cursor-pointer px-3 py-2 font-mono text-xs text-muted">
            {trace.rawModelText.length} characters — verbatim, before any parsing
          </summary>
          <pre className="overflow-x-auto border-t border-line px-3 py-2 font-mono text-[11px] text-muted">
            {trace.rawModelText || "(the provider returned nothing)"}
          </pre>
        </details>
        <p className="mt-2 text-xs text-muted">
          Stored verbatim because a parse failure that cannot be reproduced cannot be
          fixed.
        </p>
      </Section>
    </main>
  );
}

function Facts({ trace }: { trace: Trace }) {
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-1 rounded border border-line bg-panel px-4 py-3 font-mono text-xs sm:grid-cols-4">
      <Field k="prompt" v={trace.promptVersion} />
      <Field k="provider" v={`${trace.provider}/${trace.model}`} />
      <Field k="latency" v={`${trace.latencyMs}ms`} />
      <Field k="tokens" v={`${trace.usage.promptTokens} in / ${trace.usage.completionTokens} out`} />
      <Field k="created" v={trace.createdAt} />
      <Field k="degraded" v={String(trace.degraded)} />
    </div>
  );
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-muted">{k}</span>
      <span className="truncate">{v}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 font-mono text-xs tracking-wide text-muted uppercase">{title}</h2>
      {children}
    </section>
  );
}
