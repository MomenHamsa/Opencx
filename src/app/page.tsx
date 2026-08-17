import { EvalScreen } from "@/components/eval/EvalScreen";
import { loadBaseline } from "@/lib/eval/store";
import { providerAvailability } from "@/lib/llm/factory";
import { PROMPT_VERSIONS } from "@/lib/prompt/versions";

// Reads the baseline off disk on every request; there is nothing to prerender.
export const dynamic = "force-dynamic";

export default async function Home() {
  const baseline = await loadBaseline();

  // Only id and label cross to the client. The system prompts are several kilobytes
  // each and the browser has no use for them on this screen.
  const prompts = PROMPT_VERSIONS.map((p) => ({ id: p.id, label: p.label }));

  // Read server-side: whether a key exists is not something the browser should be
  // guessing at, and the key itself never leaves this process.
  const { realConfigured, realModel } = providerAvailability();

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-lg font-semibold">CX Agent Lab</h1>
        <p className="text-muted">
          A support agent, a receipt for every answer it gives, and a fixed exam that
          scores it.
        </p>
      </header>

      <EvalScreen
        prompts={prompts}
        initialBaseline={baseline}
        realConfigured={realConfigured}
        realModel={realModel}
      />
    </main>
  );
}
