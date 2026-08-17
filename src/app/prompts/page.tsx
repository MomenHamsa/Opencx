import { PageHeader } from "@/components/ui/PageHeader";
import { PromptManager } from "@/components/manage/PromptManager";
import { runCountsByPrompt } from "@/lib/eval/store";
import { SEED_PROMPTS } from "@/lib/seed/prompts";
import { loadWorkspace } from "@/lib/workspace/store";

export const dynamic = "force-dynamic";

export default async function PromptsPage() {
  const [workspace, runCounts] = await Promise.all([loadWorkspace(), runCountsByPrompt()]);

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <PageHeader title="Prompts">
        Versions are append-only. Once a version has been evaluated its text is frozen, because a score is attached to that exact wording.
      </PageHeader>

      <PromptManager
        initial={workspace.prompts}
        runCounts={runCounts}
        simulatableIds={SEED_PROMPTS.map((p) => p.id)}
      />
    </main>
  );
}
