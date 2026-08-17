import { PageHeader } from "@/components/ui/PageHeader";
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
      <PageHeader
        title="Run evaluation"
        aside={
          <a href="/runs" className="font-mono text-xs text-info hover:underline">
            run history →
          </a>
        }
      >
        Score every test against a prompt, and compare the result to your baseline.
      </PageHeader>

      <EvalScreen
        testCount={workspace.cases.length}
        prompts={prompts}
        initialBaseline={baseline}
        providers={providers}
      />
    </main>
  );
}
