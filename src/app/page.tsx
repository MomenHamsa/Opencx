import { EvalScreen } from "@/components/eval/EvalScreen";
import { loadBaseline } from "@/lib/eval/store";
import { providerOptions } from "@/lib/llm/factory";
import { loadWorkspace } from "@/lib/workspace/store";

// Reads the baseline off disk on every request; there is nothing to prerender.
export const dynamic = "force-dynamic";

export default async function Home() {
  const baseline = await loadBaseline();

  // Only id and label cross to the client. The system prompts are several kilobytes
  // each and the browser has no use for them on this screen.
  const workspace = await loadWorkspace();
  const prompts = workspace.prompts.map((p) => ({ id: p.id, label: p.label }));

  // Read server-side: whether a key exists is not something the browser should be
  // guessing at, and the key itself never leaves this process.
  const providers = providerOptions();

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
        testCount={workspace.cases.length}
        prompts={prompts}
        initialBaseline={baseline}
        providers={providers}
      />
    </main>
  );
}
