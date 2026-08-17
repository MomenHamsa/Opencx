"use client";

/**
 * Browser-side calls to the workspace CRUD routes.
 *
 * One shape for every response — `{ ok, item }` or `{ ok: false, errors }` — so the
 * three editors all render failures the same way and none of them has to know
 * whether a rejection was a validation error, an integrity conflict, or a 404.
 */

export type SaveResult<T> = { ok: true; item: T } | { ok: false; errors: string[] };

async function send<T>(url: string, method: string, body?: unknown): Promise<SaveResult<T>> {
  try {
    const response = await fetch(url, {
      method,
      headers: body === undefined ? {} : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const data = (await response.json()) as { item?: T; errors?: string[]; ok?: boolean };

    if (!response.ok) {
      return { ok: false, errors: data.errors ?? [`request failed (${response.status})`] };
    }
    return { ok: true, item: (data.item ?? (data as unknown)) as T };
  } catch (err: unknown) {
    // A network failure should read like any other error in the form, not blow up
    // the page.
    return { ok: false, errors: [err instanceof Error ? err.message : String(err)] };
  }
}

export const api = {
  create: <T,>(collection: string, value: unknown) =>
    send<T>(`/api/${collection}`, "POST", value),
  update: <T,>(collection: string, id: string, value: unknown) =>
    send<T>(`/api/${collection}/${encodeURIComponent(id)}`, "PUT", value),
  remove: <T,>(collection: string, id: string) =>
    send<T>(`/api/${collection}/${encodeURIComponent(id)}`, "DELETE"),
};
