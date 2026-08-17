import type { FailureCategory } from "@/lib/types";

/**
 * PASS / FAIL and the failure category, as the two things a person reads first.
 *
 * The category badge is the point of the whole harness: it does not just say a
 * ticket failed, it says which layer owns it. Colour carries meaning here, so each
 * badge also carries its word — a red dot alone is unreadable on a projector and
 * unreadable to anyone who does not separate red from green.
 */

export function Verdict({ passed }: { passed: boolean }) {
  return (
    <span
      className={`font-mono text-xs font-semibold ${passed ? "text-pass" : "text-fail"}`}
    >
      {passed ? "PASS" : "FAIL"}
    </span>
  );
}

const CATEGORY_STYLE: Record<FailureCategory, string> = {
  // The prompt is the thing you can go and edit.
  prompt: "border-warn/50 text-warn",
  // Nothing in the prompt will fix it; go and look at the retriever.
  retrieval: "border-info/50 text-info",
  // It never got as far as producing an answer.
  degraded: "border-fail/50 text-fail",
};

const CATEGORY_HINT: Record<FailureCategory, string> = {
  prompt: "The right evidence was available. The prompt is what to change.",
  retrieval: "The evidence was missing or too weak. No prompt edit fixes this.",
  degraded: "The run fell back to a safe escalation before answering.",
};

export function CategoryBadge({ category }: { category: FailureCategory | null }) {
  if (category === null) return <span className="text-muted">—</span>;

  return (
    <span
      title={CATEGORY_HINT[category]}
      className={`inline-block rounded border px-1.5 py-0.5 font-mono text-[11px] ${CATEGORY_STYLE[category]}`}
    >
      {category}
    </span>
  );
}
