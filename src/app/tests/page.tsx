import { PageHeader } from "@/components/ui/PageHeader";
import { TestManager } from "@/components/manage/TestManager";
import { loadWorkspace } from "@/lib/workspace/store";

export const dynamic = "force-dynamic";

export default async function TestsPage() {
  const workspace = await loadWorkspace();

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <PageHeader title="Tests">
        The exam. Every escalation a customer complains about should end up here, so it can never regress.
      </PageHeader>

      <TestManager initial={workspace.cases} articles={workspace.articles} />
    </main>
  );
}
