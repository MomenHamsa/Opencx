import path from "node:path";

/**
 * The knobs that change agent behaviour, in one place.
 *
 * Not for tidiness. When an eval score moves, the first question is "what changed",
 * and a constant buried three directories down is a change nobody can see. These are
 * the knobs; the eval harness is how you find out what turning one did.
 *
 * One number is deliberately *not* here: `MIN_RELEVANCE` lives in the keyword
 * retriever. It is a BM25 score threshold, so it is meaningless to any other
 * implementation of `Retriever` — moving it here would imply it survives swapping the
 * retriever out, and it does not.
 */

/** How many articles the agent is shown. See MIN_RELEVANCE in the retriever too. */
export const TOP_K = 3;

/**
 * Below this confidence the v2 escalation policy hands off. 0.6 is not arbitrary —
 * it is the same default the AI agent handoff article documents to customers, and
 * shipping an agent that ignores our own published default would be a bad look.
 */
export const HANDOFF_CONFIDENCE = 0.6;

/**
 * Below this BM25 score, retrieval found something but nothing convincing.
 *
 * Used in two places that must agree: the mock's behaviour when it is unsure, and
 * the eval harness deciding whether a failure was caused by retrieval or by the
 * prompt. If these two drifted apart the harness would be diagnosing a system that
 * no longer exists.
 */
export const WEAK_RETRIEVAL_SCORE = 6;

// Traces and eval runs are plain JSON on disk. No database is in scope, and for a
// tool whose entire job is being readable, `cat` beating a query is a feature.
export const DATA_DIR = path.join(process.cwd(), "data");
export const TRACES_DIR = path.join(DATA_DIR, "traces");
export const RUNS_DIR = path.join(DATA_DIR, "runs");
export const BASELINE_FILE = path.join(DATA_DIR, "baseline.json");

/**
 * Authored content: knowledge base, test cases, prompts. Gitignored, because a real
 * knowledge base and real customer tickets are not sample data and should never
 * reach a public repository by way of `git add -A`.
 */
export const CONFIG_DIR = path.join(DATA_DIR, "config");
