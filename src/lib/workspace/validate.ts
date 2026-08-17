import { ACTIONS, CHANNELS, INTENTS } from "@/lib/types";
import type { Article, GoldenCase, PromptVersion } from "@/lib/types";

/**
 * Validation for everything a person can author: knowledge-base articles, test
 * cases, and prompts.
 *
 * Same posture as `agent/validate.ts`, for the same reason. Model output is
 * untrusted because it comes from another system; authored content is untrusted
 * because it comes from a form, and a form is where a typo becomes a broken exam.
 * A test case citing an article id that does not exist would silently fail forever
 * and look like an agent bug — so that is checked here, at the point of saving,
 * where the person can still fix it.
 *
 * Errors are collected rather than thrown on the first miss, so a form can show
 * everything wrong at once instead of one problem per save.
 */

export type Validated<T> = { ok: true; value: T } | { ok: false; errors: string[] };

/** Ids end up in filenames, URLs and citations, so keep them boring. */
const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

// ---------------------------------------------------------------------------
// Articles
// ---------------------------------------------------------------------------

export function validateArticle(input: unknown, existingIds: string[]): Validated<Article> {
  const errors: string[] = [];
  const raw = asRecord(input, errors);
  if (raw === null) return { ok: false, errors };

  const id = requireId(raw.id, "id", errors);
  if (id !== undefined && existingIds.includes(id)) {
    errors.push(`an article with id "${id}" already exists`);
  }

  const title = requireText(raw.title, "title", 1, 200, errors);
  const body = requireText(raw.body, "body", 1, 20_000, errors);

  // Tags are optional but must be strings when present — the retriever weights
  // them, so a stray object here would silently distort every search.
  let tags: string[] = [];
  if (raw.tags !== undefined) {
    if (!Array.isArray(raw.tags) || !raw.tags.every((t): t is string => typeof t === "string")) {
      errors.push("tags must be an array of strings");
    } else {
      tags = raw.tags.map((t) => t.trim()).filter((t) => t !== "");
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      id: id as string,
      title: (title as string).trim(),
      tags,
      body: (body as string).trim(),
      updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : today(),
    },
  };
}

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------

export function validateCase(
  input: unknown,
  existingTicketIds: string[],
  knownArticleIds: string[],
): Validated<GoldenCase> {
  const errors: string[] = [];
  const raw = asRecord(input, errors);
  if (raw === null) return { ok: false, errors };

  const ticket = asRecord(raw.ticket, errors, "ticket");
  const expect = asRecord(raw.expect, errors, "expect");
  if (ticket === null || expect === null) return { ok: false, errors };

  const id = requireId(ticket.id, "ticket.id", errors);
  if (id !== undefined && existingTicketIds.includes(id)) {
    errors.push(`a test case with ticket id "${id}" already exists`);
  }

  const subject = requireText(ticket.subject, "ticket.subject", 1, 300, errors);
  const body = requireText(ticket.body, "ticket.body", 1, 20_000, errors);

  const email = typeof ticket.customerEmail === "string" ? ticket.customerEmail.trim() : "";
  if (!email.includes("@")) errors.push("ticket.customerEmail must be an email address");

  const channel = CHANNELS.find((c) => c === ticket.channel);
  if (channel === undefined) {
    errors.push(`ticket.channel must be one of: ${CHANNELS.join(", ")}`);
  }

  // action is the only required expectation: every test must say what the agent
  // was supposed to do, or there is nothing to grade.
  const action = ACTIONS.find((a) => a === expect.action);
  if (action === undefined) {
    errors.push(`expect.action must be one of: ${ACTIONS.join(", ")}`);
  }

  let intent: GoldenCase["expect"]["intent"];
  if (expect.intent !== undefined && expect.intent !== null && expect.intent !== "") {
    intent = INTENTS.find((i) => i === expect.intent);
    if (intent === undefined) errors.push(`expect.intent must be one of: ${INTENTS.join(", ")}`);
  }

  // The check that earns this whole file: a citation expectation pointing at an
  // article that does not exist can never pass, and would read as an agent failure
  // forever.
  const citesAnyOf = optionalStringArray(expect.citesAnyOf, "expect.citesAnyOf", errors);
  for (const articleId of citesAnyOf ?? []) {
    if (!knownArticleIds.includes(articleId)) {
      errors.push(`expect.citesAnyOf refers to "${articleId}", which is not an article in this workspace`);
    }
  }

  const mustNotContain = optionalStringArray(expect.mustNotContain, "expect.mustNotContain", errors);

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      ticket: {
        id: id as string,
        customerEmail: email,
        channel: channel as GoldenCase["ticket"]["channel"],
        subject: (subject as string).trim(),
        body: (body as string).trim(),
      },
      expect: {
        ...(intent === undefined ? {} : { intent }),
        action: action as GoldenCase["expect"]["action"],
        ...(citesAnyOf === undefined || citesAnyOf.length === 0 ? {} : { citesAnyOf }),
        ...(mustNotContain === undefined || mustNotContain.length === 0
          ? {}
          : { mustNotContain }),
      },
      note: typeof raw.note === "string" ? raw.note.trim() : "",
    },
  };
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

export function validatePrompt(input: unknown, existingIds: string[]): Validated<PromptVersion> {
  const errors: string[] = [];
  const raw = asRecord(input, errors);
  if (raw === null) return { ok: false, errors };

  const id = requireId(raw.id, "id", errors);
  if (id !== undefined && existingIds.includes(id)) {
    errors.push(`a prompt version with id "${id}" already exists`);
  }

  const label = requireText(raw.label, "label", 1, 120, errors);
  const system = requireText(raw.system, "system", 1, 100_000, errors);

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      id: id as string,
      label: (label as string).trim(),
      // Optional, because a first draft rarely has a story yet. It stops being
      // optional in practice the moment you have two versions and have to explain
      // the difference to someone else.
      changelog: typeof raw.changelog === "string" ? raw.changelog.trim() : "",
      system: system as string,
    },
  };
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function asRecord(
  value: unknown,
  errors: string[],
  field = "body",
): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    errors.push(`${field} must be an object`);
    return null;
  }
  return value as Record<string, unknown>;
}

function requireId(value: unknown, field: string, errors: string[]): string | undefined {
  if (typeof value !== "string" || value.trim() === "") {
    errors.push(`${field} is required`);
    return undefined;
  }
  const id = value.trim();
  if (!ID_PATTERN.test(id)) {
    errors.push(`${field} may only contain letters, numbers, dot, dash and underscore`);
    return undefined;
  }
  return id;
}

function requireText(
  value: unknown,
  field: string,
  min: number,
  max: number,
  errors: string[],
): string | undefined {
  if (typeof value !== "string") {
    errors.push(`${field} must be text`);
    return undefined;
  }
  const text = value.trim();
  if (text.length < min) {
    errors.push(`${field} is required`);
    return undefined;
  }
  if (text.length > max) {
    errors.push(`${field} is longer than the ${max} character limit`);
    return undefined;
  }
  return value;
}

function optionalStringArray(
  value: unknown,
  field: string,
  errors: string[],
): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || !value.every((v): v is string => typeof v === "string")) {
    errors.push(`${field} must be an array of strings`);
    return undefined;
  }
  return value.map((v) => v.trim()).filter((v) => v !== "");
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
