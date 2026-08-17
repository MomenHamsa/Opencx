import { PlaygroundForm } from "@/components/playground/PlaygroundForm";
import { providerAvailability } from "@/lib/llm/factory";
import { PROMPT_VERSIONS } from "@/lib/prompt/versions";

export const dynamic = "force-dynamic";

export default function PlaygroundPage() {
  const prompts = PROMPT_VERSIONS.map((p) => ({ id: p.id, label: p.label }));
  const { realConfigured, realModel } = providerAvailability();

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
        realConfigured={realConfigured}
        realModel={realModel}
      />
    </main>
  );
}
