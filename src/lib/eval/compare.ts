import { createSpecificityJudge } from "@/lib/eval/judge";
import { runEvaluation } from "@/lib/eval/run";
import { latestRunForVersion, saveRun } from "@/lib/eval/store";
import { createMockProvider } from "@/lib/llm/mock";
import { createKeywordRetriever } from "@/lib/retrieval/keyword";
import type { Workspace } from "@/lib/workspace/store";
import type { EvalRun, PromptVersion } from "@/lib/types";

/**
 * The run to show for a prompt version on the comparison screen.
 *
 * Reuses the most recent saved run if there is one, and only runs the exam when there
 * is not. Two reasons for preferring the saved run: it is what actually happened, so
 * the comparison screen and the eval screen cannot disagree; and a page that silently
 * re-runs an evaluation on every refresh would make the trace directory grow every
 * time someone hits F5.
 *
 * Running on demand when nothing is saved is what makes the screen work on a fresh
 * clone. Against the mock that costs about a second; against a real provider it would
 * need to be a button instead, which is a note worth making out loud rather than a
 * problem to hide.
 */
export async function runForVersion(
  prompt: PromptVersion,
  workspace: Workspace,
): Promise<EvalRun> {
  const saved = await latestRunForVersion(prompt.id);

  // Reuse only a mock run. A saved run from a real provider would quietly put a
  // different model in one column of a screen whose entire claim is that only the
  // prompt differs.
  if (saved !== null && saved.provider === "mock") return saved;

  const run = await runEvaluation({
    prompt,
    // Always the mock here. This screen compares *prompts*, so holding the provider
    // fixed is the only way the comparison means anything.
    provider: createMockProvider(),
    retriever: createKeywordRetriever(workspace.articles),
    judge: createSpecificityJudge(),
    cases: workspace.cases,
    articles: workspace.articles,
  });

  await saveRun(run);
  return run;
}
