import fs from "node:fs";
import path from "node:path";

/**
 * Load `.env` for the CLI scripts.
 *
 * Next.js does this for the web app; a bare `tsx script.ts` does not. The obvious
 * fix — `node --env-file=.env` — cannot be reached through `npm run x -- --env-file`,
 * because npm appends extra arguments *after* the script path, where node no longer
 * reads flags. Putting the flag inside the npm script instead breaks every run on a
 * machine with no `.env`, since Node 20 errors on a missing env file and
 * `--env-file-if-exists` only arrived in Node 22.
 *
 * So: fifteen lines, no dependency, and `npm run m3 -- v2 --openai` just works.
 * Existing environment variables win, so `OPENAI_API_KEY=… npm run m3` still
 * overrides the file.
 */
export function loadEnvFile(file = ".env"): void {
  const target = path.join(process.cwd(), file);

  let contents: string;
  try {
    contents = fs.readFileSync(target, "utf8");
  } catch {
    return; // No .env is the normal case for the mock provider.
  }

  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    if (key === "" || process.env[key] !== undefined) continue;

    // Strip one layer of matching quotes, the way every .env parser does.
    const value = trimmed.slice(eq + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
    process.env[key] = value;
  }
}
