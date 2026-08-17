import { TestManager } from "@/components/manage/TestManager";
import { loadWorkspace } from "@/lib/workspace/store";

export const dynamic = "force-dynamic";

export default async function TestsPage() {
  const workspace = await loadWorkspace();

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-lg font-semibold">Tests</h1>
        <p className="text-muted">
          The exam. Every escalation a customer complains about should end up here, so
          it can never regress.
        </p>
      </header>

      <TestManager initial={workspace.cases} articles={workspace.articles} />
    </main>
  );
}
