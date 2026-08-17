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
      <header className="mb-6">
        <h1 className="text-lg font-semibold">Playground</h1>
        <p className="text-muted">
          Run any ticket through the agent and land on its trace. Same code path as the
          exam.
        </p>
      </header>

      <PlaygroundForm
        prompts={prompts}
        providers={providers}
      />
    </main>
  );
}
