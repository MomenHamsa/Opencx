import { randomUUID } from "node:crypto";
import { runAgent } from "@/lib/agent/run";
import { createProvider, isProviderId } from "@/lib/llm/factory";
import { findPrompt, loadWorkspace } from "@/lib/workspace/store";
import { createKeywordRetriever } from "@/lib/retrieval/keyword";
import type { Channel, Ticket } from "@/lib/types";

/**
 * Run one ad-hoc ticket through the agent and return its trace id.
 *
 * This is the "what happens if a customer asks X?" endpoint. It runs the same
 * `runAgent` as the eval harness — no separate code path — so what you see in the
 * playground is what the exam would have seen.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHANNELS: Channel[] = ["email", "chat", "widget"];

export async function POST(request: Request): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (text === "") {
    return Response.json({ error: "ticket body is required" }, { status: 400 });
  }

  const workspace = await loadWorkspace();
  const prompt = findPrompt(workspace, typeof body.promptVersion === "string" ? body.promptVersion : "");
  if (prompt === undefined) {
    return Response.json({ error: "unknown prompt version" }, { status: 400 });
  }

  let provider;
  try {
    provider = createProvider(isProviderId(body.provider) ? body.provider : "mock");
  } catch (err: unknown) {
    return Response.json(
      { error: err instanceof Error ? err.message : "provider unavailable" },
      { status: 400 },
    );
  }

  const channel = CHANNELS.find((c) => c === body.channel) ?? "email";
  const subject = typeof body.subject === "string" && body.subject.trim() !== ""
    ? body.subject.trim()
    : text.slice(0, 60);

  const ticket: Ticket = {
    // PG- prefixed so playground traces are obvious in data/traces, and so the trace
    // page finds no golden case for them and correctly shows no expectations.
    id: `PG-${randomUUID().slice(0, 4)}`,
    customerEmail:
      typeof body.customerEmail === "string" && body.customerEmail.includes("@")
        ? body.customerEmail.trim()
        : "someone@example.com",
    channel,
    subject,
    body: text,
  };

  // runAgent cannot throw and always persists, so there is nothing to wrap here.
  const trace = await runAgent({
    ticket,
    prompt,
    provider,
    retriever: createKeywordRetriever(workspace.articles),
  });

  return Response.json({ traceId: trace.traceId });
}
