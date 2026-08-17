import { KbManager } from "@/components/manage/KbManager";
import { loadWorkspace } from "@/lib/workspace/store";

export const dynamic = "force-dynamic";

export default async function KbPage() {
  const workspace = await loadWorkspace();

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-lg font-semibold">Knowledge base</h1>
        <p className="text-muted">
          The only evidence the agent may ground an answer in. What is missing here is
          what it has to escalate.
        </p>
      </header>

      <KbManager initial={workspace.articles} />
    </main>
  );
}
