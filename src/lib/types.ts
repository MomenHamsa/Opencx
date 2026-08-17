/**
 * Every type the agent, the trace recorder and the eval harness share.
 *
 * One file, because these are the nouns of the whole project and I want to be
 * able to point at a single screen and say "this is the domain".
 */

// ---------------------------------------------------------------------------
// Knowledge base
// ---------------------------------------------------------------------------

export interface Article {
  id: string;
  title: string;
  /** Curated keywords. The retriever boosts these because a human chose them. */
  tags: string[];
  body: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------------

export type Channel = "email" | "chat" | "widget";

export interface Ticket {
  id: string;
  customerEmail: string;
  channel: Channel;
  subject: string;
  body: string;
}

// ---------------------------------------------------------------------------
// What the agent must return
// ---------------------------------------------------------------------------

/**
 * A closed set on purpose. An open-ended `string` intent cannot be graded
 * deterministically, and "misclassification" stops being a measurable failure.
 */
export const INTENTS = [
  "integration_issue",
  "api_limits",
  "billing_refund",
  "account_access",
  "ai_agent_config",
  "legal_compliance",
  "sales_negotiation",
  "product_question",
  "other",
] as const;
export type Intent = (typeof INTENTS)[number];

export const URGENCIES = ["low", "normal", "high", "urgent"] as const;
export type Urgency = (typeof URGENCIES)[number];

/** `escalate` means: hand to a human, do not send the reply as a resolution. */
export const ACTIONS = ["reply", "escalate"] as const;
export type Action = (typeof ACTIONS)[number];

export interface AgentOutput {
  intent: Intent;
  urgency: Urgency;
  action: Action;
  /** 0..1. Used by the escalation policy in the v2 prompt (below 0.6 -> escalate). */
  confidence: number;
  reply: string;
  /** Article IDs the reply is grounded in. Empty is legal, but graded. */
  citations: string[];
}

// ---------------------------------------------------------------------------
// Retrieval
// ---------------------------------------------------------------------------

export interface RetrievedArticle {
  article: Article;
  score: number;
  /** Which query terms actually hit. Makes a bad retrieval readable in the UI. */
  matchedTerms: string[];
}

/**
 * Swappable because customers arrive with different search stacks: keyword today,
 * their own vector index tomorrow. `Promise` because the next implementation is a
 * network call, and I do not want that change to ripple through the agent.
 */
export interface Retriever {
  readonly name: string;
  search(query: string, k: number): Promise<RetrievedArticle[]>;
}

// ---------------------------------------------------------------------------
// LLM provider
// ---------------------------------------------------------------------------

export interface LLMRequest {
  system: string;
  user: string;
  /** Kept low for grading stability; a creative agent is an unrepeatable exam. */
  temperature?: number;
  maxTokens?: number;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
}

export interface LLMResponse {
  /** Raw text, exactly as the model produced it. The trace stores this verbatim. */
  text: string;
  usage: TokenUsage;
  latencyMs: number;
}

/**
 * Swappable because a regression is model-specific: the same prompt that is safe
 * on one model leaks on another, and a customer's "it broke" starts with "on which model?".
 */
export interface LLMProvider {
  /** Shown in the trace so a run is always attributable to a provider + model. */
  readonly name: string;
  readonly model: string;
  complete(req: LLMRequest): Promise<LLMResponse>;
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export interface ToolCall {
  name: string;
  input: Record<string, unknown>;
  output: unknown;
  durationMs: number;
  error?: string;
}

/**
 * Swappable because these are fake backend lookups today and a customer's real
 * API tomorrow. The agent only ever sees `name` + `run`.
 */
export interface Tool {
  readonly name: string;
  readonly description: string;
  run(input: Record<string, unknown>): Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

export interface PromptVersion {
  id: string;
  label: string;
  /** What changed and why. A prompt without one is a diff nobody can review. */
  changelog: string;
  system: string;
}

// ---------------------------------------------------------------------------
// Traces
// ---------------------------------------------------------------------------

/** The slim form of a retrieval result. Enough to explain a ranking, no article bodies. */
export interface TracedRetrieval {
  articleId: string;
  title: string;
  score: number;
  matchedTerms: string[];
}

/**
 * The receipt for one agent run.
 *
 * Deliberately self-contained: the ticket is embedded rather than referenced, so a
 * trace answers "why did the agent say that?" on its own, without the golden set,
 * the KB version or the customer's environment. That is the whole point — the
 * alternative is asking a customer to reproduce a problem that already happened.
 */
export interface Trace {
  traceId: string;
  createdAt: string;
  ticket: Ticket;
  promptVersion: string;
  provider: string;
  model: string;
  retrieved: TracedRetrieval[];
  toolCalls: ToolCall[];
  /** Verbatim. Without this, a parse failure is unreproducible and therefore unfixable. */
  rawModelText: string;
  /** Always present. On a degraded run this is the safe fallback, not the model's output. */
  output: AgentOutput;
  degraded: boolean;
  /** Why it degraded, in words. Empty string when it did not. */
  degradedReason: string;
  latencyMs: number;
  usage: TokenUsage;
}

// ---------------------------------------------------------------------------
// Golden set (the exam)
// ---------------------------------------------------------------------------

export interface Expectation {
  /** Optional: some tickets are legitimately ambiguous, so intent is not graded. */
  intent?: Intent;
  action: Action;
  /** Passing citation check requires at least one of these IDs. Reply cases only. */
  citesAnyOf?: string[];
  /** Case-insensitive substrings the reply must never contain. */
  mustNotContain?: string[];
}

export interface GoldenCase {
  ticket: Ticket;
  expect: Expectation;
  /** Why this case exists. Written for the person who has to keep the exam honest. */
  note: string;
}

// ---------------------------------------------------------------------------
// Grading
// ---------------------------------------------------------------------------

export const CHECK_NAMES = [
  "no_degrade",
  "intent",
  "action",
  "citation",
  "forbidden_content",
  "grounded",
  "retrieval_hit",
] as const;
export type CheckName = (typeof CHECK_NAMES)[number];

export interface CheckResult {
  name: CheckName;
  /** Meaningless when `skipped` is true. */
  passed: boolean;
  /** Why, in words. This is what the expanded failed row shows. */
  detail: string;
  /** Diagnostic checks never affect pass/fail. Only `retrieval_hit` is one. */
  diagnostic: boolean;
  /** The expectation did not specify this, so there was nothing to check. */
  skipped: boolean;
}

/**
 * Which layer to go and fix. The whole reason the harness is more useful than
 * reading outputs: it does not just say a ticket failed, it says who owns it.
 */
export type FailureCategory = "prompt" | "retrieval" | "degraded";

export interface EvalRow {
  ticketId: string;
  subject: string;
  traceId: string;
  passed: boolean;
  action: Action;
  expectedAction: Action;
  checks: CheckResult[];
  /** null when the row passed. */
  failureCategory: FailureCategory | null;
  degraded: boolean;
  latencyMs: number;
}

export interface EvalRun {
  runId: string;
  createdAt: string;
  promptVersion: string;
  provider: string;
  model: string;
  passed: number;
  total: number;
  rows: EvalRow[];
}

export interface BaselineDiff {
  baselineRunId: string;
  baselinePromptVersion: string;
  baselinePassed: number;
  baselineTotal: number;
  /** Failed in the baseline, passes now. */
  fixed: string[];
  /** Passed in the baseline, fails now. The number that stops a release. */
  regressed: string[];
  /** Failed in both. Usually where the retrieval-category failures live. */
  stillFailing: string[];
  /** In one run but not the other, so not comparable. */
  notInBaseline: string[];
}
