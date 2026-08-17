import { PageHeader } from "@/components/ui/PageHeader";
import { PlaygroundForm } from "@/components/playground/PlaygroundForm";
import { providerOptions } from "@/lib/llm/factory";
import { loadWorkspace } from "@/lib/workspace/store";

export const dynamic = "force-dynamic";

export default async function PlaygroundPage() {
  const workspace = await loadWorkspace();
  const prompts = workspace.prompts.map((p) => ({ id: p.id, label: p.label }));
  const providers = providerOptions();

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <PageHeader title="Playground">
        Run any ticket through the agent and land on its trace. Same code path as the exam.
      </PageHeader>

      <PlaygroundForm
        prompts={prompts}
        providers={providers}
      />
    </main>
  );
}
