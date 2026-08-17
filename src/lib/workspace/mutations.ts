import { runCountsByPrompt } from "@/lib/eval/store";
import {
  loadWorkspace,
  saveArticles,
  saveCases,
  savePrompts,
} from "@/lib/workspace/store";
import { validateArticle, validateCase, validatePrompt } from "@/lib/workspace/validate";
import type { Article, GoldenCase, PromptVersion } from "@/lib/types";

/**
 * Every change a person can make to the workspace, with the integrity rules that
 * keep the exam meaningful.
 *
 * The rules live here rather than in the route handlers, because they are the
 * interesting part and they are the same whether the change arrives from a form, a
 * script, or something we have not built yet. Three of them matter:
 *
 *  1. You cannot delete an article a test cites. The test could never pass again,
 *     and it would read as an agent failure rather than a missing document.
 *  2. You cannot edit or delete a prompt that has already been run. A score is
 *     attached to that exact text; letting it change afterwards would make every
 *     historical run and every baseline a lie.
 *  3. Nothing is written unless it validates. Same posture as model output.
 */

export type MutationResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; errors: string[] };

const conflict = (message: string): MutationResult<never> => ({
  ok: false,
  status: 409,
  errors: [message],
});

const invalid = (errors: string[]): MutationResult<never> => ({ ok: false, status: 400, errors });

const missing = (what: string): MutationResult<never> => ({
  ok: false,
  status: 404,
  errors: [`${what} does not exist`],
});

// ---------------------------------------------------------------------------
// Articles
// ---------------------------------------------------------------------------

export async function createArticle(input: unknown): Promise<MutationResult<Article>> {
  const ws = await loadWorkspace();
  const result = validateArticle(input, ws.articles.map((a) => a.id));
  if (!result.ok) return invalid(result.errors);

  await saveArticles([...ws.articles, result.value]);
  return { ok: true, value: result.value };
}

export async function updateArticle(id: string, input: unknown): Promise<MutationResult<Article>> {
  const ws = await loadWorkspace();
  const index = ws.articles.findIndex((a) => a.id === id);
  if (index === -1) return missing(`article "${id}"`);

  // Exclude the article's own id from the uniqueness check, or every save of an
  // unchanged id would report a duplicate.
  const otherIds = ws.articles.filter((a) => a.id !== id).map((a) => a.id);
  const result = validateArticle({ ...(input as object), id }, otherIds);
  if (!result.ok) return invalid(result.errors);

  const next = [...ws.articles];
  next[index] = { ...result.value, updatedAt: new Date().toISOString().slice(0, 10) };
  await saveArticles(next);
  return { ok: true, value: next[index] };
}

export async function deleteArticle(id: string): Promise<MutationResult<{ id: string }>> {
  const ws = await loadWorkspace();
  if (!ws.articles.some((a) => a.id === id)) return missing(`article "${id}"`);

  const citedBy = ws.cases
    .filter((c) => (c.expect.citesAnyOf ?? []).includes(id))
    .map((c) => c.ticket.id);

  if (citedBy.length > 0) {
    return conflict(
      citedBy.length === 1
        ? `Test ${citedBy[0]} expects this article to be cited. Update that test first, or it can never pass.`
        : `${citedBy.length} tests expect this article to be cited (${citedBy.join(", ")}). Update those tests first, or they can never pass.`,
    );
  }

  await saveArticles(ws.articles.filter((a) => a.id !== id));
  return { ok: true, value: { id } };
}

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------

export async function createCase(input: unknown): Promise<MutationResult<GoldenCase>> {
  const ws = await loadWorkspace();
  const result = validateCase(
    input,
    ws.cases.map((c) => c.ticket.id),
    ws.articles.map((a) => a.id),
  );
  if (!result.ok) return invalid(result.errors);

  await saveCases([...ws.cases, result.value]);
  return { ok: true, value: result.value };
}

export async function updateCase(id: string, input: unknown): Promise<MutationResult<GoldenCase>> {
  const ws = await loadWorkspace();
  const index = ws.cases.findIndex((c) => c.ticket.id === id);
  if (index === -1) return missing(`test "${id}"`);

  const otherIds = ws.cases.filter((c) => c.ticket.id !== id).map((c) => c.ticket.id);
  const raw = input as { ticket?: object };
  const result = validateCase(
    { ...(input as object), ticket: { ...(raw.ticket ?? {}), id } },
    otherIds,
    ws.articles.map((a) => a.id),
  );
  if (!result.ok) return invalid(result.errors);

  const next = [...ws.cases];
  next[index] = result.value;
  await saveCases(next);
  return { ok: true, value: result.value };
}

export async function deleteCase(id: string): Promise<MutationResult<{ id: string }>> {
  const ws = await loadWorkspace();
  if (!ws.cases.some((c) => c.ticket.id === id)) return missing(`test "${id}"`);

  // Deliberately unguarded. Removing a question from the exam changes the
  // denominator, which the baseline diff already reports as "not in baseline"
  // rather than silently miscounting.
  await saveCases(ws.cases.filter((c) => c.ticket.id !== id));
  return { ok: true, value: { id } };
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

export async function createPrompt(input: unknown): Promise<MutationResult<PromptVersion>> {
  const ws = await loadWorkspace();
  const result = validatePrompt(input, ws.prompts.map((p) => p.id));
  if (!result.ok) return invalid(result.errors);

  await savePrompts([...ws.prompts, result.value]);
  return { ok: true, value: result.value };
}

export async function updatePrompt(
  id: string,
  input: unknown,
): Promise<MutationResult<PromptVersion>> {
  const ws = await loadWorkspace();
  const index = ws.prompts.findIndex((p) => p.id === id);
  if (index === -1) return missing(`prompt "${id}"`);

  const runs = (await runCountsByPrompt())[id] ?? 0;
  if (runs > 0) {
    return conflict(
      `"${id}" has been evaluated ${runs} time${runs === 1 ? "" : "s"}, so its text is frozen. Save it as a new version instead — a score is attached to this exact wording.`,
    );
  }

  const otherIds = ws.prompts.filter((p) => p.id !== id).map((p) => p.id);
  const result = validatePrompt({ ...(input as object), id }, otherIds);
  if (!result.ok) return invalid(result.errors);

  const next = [...ws.prompts];
  next[index] = result.value;
  await savePrompts(next);
  return { ok: true, value: result.value };
}

export async function deletePrompt(id: string): Promise<MutationResult<{ id: string }>> {
  const ws = await loadWorkspace();
  if (!ws.prompts.some((p) => p.id === id)) return missing(`prompt "${id}"`);

  const runs = (await runCountsByPrompt())[id] ?? 0;
  if (runs > 0) {
    return conflict(
      `"${id}" has ${runs} saved run${runs === 1 ? "" : "s"} attached to it. Deleting it would leave those results describing a prompt that no longer exists.`,
    );
  }

  await savePrompts(ws.prompts.filter((p) => p.id !== id));
  return { ok: true, value: { id } };
}
