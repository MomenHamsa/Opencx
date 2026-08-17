import Link from "next/link";
import { providerOptions } from "@/lib/llm/factory";
import { loadWorkspace } from "@/lib/workspace/store";

/**
 * A one-line answer to "what state is my workspace in".
 *
 * Three counts and the available providers. It is small, but it does two jobs a
 * new person needs and an experienced one still wants:
 *
 *  - It shows the dependency chain in reading order. Articles, then tests, then
 *    prompts — which is the order you have to build them in, because tests cite
 *    articles.
 *  - It turns an empty workspace into an instruction instead of an empty table.
 *    A zero is rendered as a call to action, not as a number.
 */
export async function WorkspaceBar() {
  const [workspace, providers] = await Promise.all([
    loadWorkspace(),
    Promise.resolve(providerOptions()),
  ]);

  const live = providers.filter((p) => p.live && p.available);

  const counts = [
    { href: "/kb", label: "articles", n: workspace.articles.length },
    { href: "/tests", label: "tests", n: workspace.cases.length },
    { href: "/prompts", label: "prompts", n: workspace.prompts.length },
  ];

  return (
    <div className="border-b border-line bg-ink">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-1 px-6 py-1.5 font-mono text-[11px]">
        {counts.map((c, i) => (
          <span key={c.href} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-line-strong">→</span>}
            <Link
              href={c.href}
              className={
                c.n === 0
                  ? "text-warn hover:underline"
                  : "text-muted hover:text-text hover:underline"
              }
            >
              <span className="tnum">{c.n}</span> {c.label}
              {c.n === 0 && " — add some"}
            </Link>
          </span>
        ))}

        <span className="ml-auto text-faint">
          {live.length === 0 ? (
            <>
              mock only ·{" "}
              <span className="text-muted">add a key to .env for live models</span>
            </>
          ) : (
            <>live: {live.map((p) => p.id).join(", ")}</>
          )}
        </span>
      </div>
    </div>
  );
}
