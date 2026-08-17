import fs from "node:fs/promises";
import path from "node:path";
import { CONFIG_DIR } from "@/lib/config";
import { SEED_ARTICLES } from "@/lib/seed/articles";
import { SEED_CASES } from "@/lib/seed/cases";
import { SEED_PROMPTS } from "@/lib/seed/prompts";
import type { Article, GoldenCase, PromptVersion } from "@/lib/types";

/**
 * The workspace: the knowledge base, the test cases and the prompts, as data you
 * can edit rather than code you have to redeploy.
 *
 * Everything lives as JSON under `data/config/`, seeded on first read from the
 * bundled sample content. Three consequences worth knowing:
 *
 *  - A fresh checkout still works. Delete `data/config/` and the samples come back.
 *  - `data/config/` is gitignored. Your real knowledge base and real customer
 *    tickets are not sample data, and should not reach a public repository because
 *    someone ran `git add -A`.
 *  - Files, not a database, because this is a single-user tool on a host with a real
 *    filesystem, and a JSON file you can read, diff and hand-edit is worth more here
 *    than query support nobody needs yet.
 *
 * Server-side only.
 */

export interface Workspace {
  articles: Article[];
  cases: GoldenCase[];
  prompts: PromptVersion[];
}

const FILES = {
  articles: "articles.json",
  cases: "cases.json",
  prompts: "prompts.json",
} as const;

async function readOrSeed<T>(file: string, seed: T[]): Promise<T[]> {
  const target = path.join(CONFIG_DIR, file);
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(target, "utf8"));
    // A hand-edited file that is no longer an array should not take the app down;
    // fall back to the seed and let the person see the samples rather than a crash.
    return Array.isArray(parsed) ? (parsed as T[]) : seed;
  } catch {
    await writeFile(file, seed);
    return seed;
  }
}

async function writeFile<T>(file: string, value: T[]): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  // Written through a temp file and renamed, so a crash mid-write cannot leave a
  // half-written knowledge base behind. Rename is atomic on the same filesystem.
  const target = path.join(CONFIG_DIR, file);
  const temp = `${target}.tmp`;
  await fs.writeFile(temp, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(temp, target);
}

export async function loadWorkspace(): Promise<Workspace> {
  const [articles, cases, prompts] = await Promise.all([
    readOrSeed<Article>(FILES.articles, SEED_ARTICLES),
    readOrSeed<GoldenCase>(FILES.cases, SEED_CASES),
    readOrSeed<PromptVersion>(FILES.prompts, SEED_PROMPTS),
  ]);
  return { articles, cases, prompts };
}

export async function saveArticles(articles: Article[]): Promise<void> {
  await writeFile(FILES.articles, articles);
}

export async function saveCases(cases: GoldenCase[]): Promise<void> {
  await writeFile(FILES.cases, cases);
}

export async function savePrompts(prompts: PromptVersion[]): Promise<void> {
  await writeFile(FILES.prompts, prompts);
}

/** Restore the bundled samples, discarding whatever is there. */
export async function resetWorkspace(): Promise<Workspace> {
  await Promise.all([
    writeFile(FILES.articles, SEED_ARTICLES),
    writeFile(FILES.cases, SEED_CASES),
    writeFile(FILES.prompts, SEED_PROMPTS),
  ]);
  return loadWorkspace();
}

// ---------------------------------------------------------------------------
// Lookups — these used to live next to the hardcoded arrays
// ---------------------------------------------------------------------------

export function findArticle(ws: Workspace, id: string): Article | undefined {
  return ws.articles.find((a) => a.id === id);
}

export function findCase(ws: Workspace, ticketId: string): GoldenCase | undefined {
  return ws.cases.find((c) => c.ticket.id === ticketId);
}

export function findPrompt(ws: Workspace, id: string): PromptVersion | undefined {
  return ws.prompts.find((p) => p.id === id);
}
