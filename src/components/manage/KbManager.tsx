"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Button,
  ErrorList,
  Field,
  ListInput,
  ListRow,
  ManagerLayout,
  SavedFlash,
  TextArea,
  TextInput,
} from "@/components/ui/form";
import { api } from "@/lib/workspace/client";
import type { Article } from "@/lib/types";

/**
 * The knowledge base editor.
 *
 * The articles here are the only evidence the agent is allowed to ground an answer
 * in, so this screen decides what the agent can honestly say. Two things are worth
 * writing well: the `tags`, which the retriever weights above body text because a
 * human chose them, and the deliberate gaps — a question your KB genuinely cannot
 * answer is what an escalation test is for.
 */

const BLANK: Article = { id: "", title: "", tags: [], body: "", updatedAt: "" };

export function KbManager({ initial }: { initial: Article[] }) {
  const router = useRouter();
  const [articles, setArticles] = useState(initial);
  const [selectedId, setSelectedId] = useState<string | null>(initial[0]?.id ?? null);
  const [draft, setDraft] = useState<Article | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const selected = articles.find((a) => a.id === selectedId) ?? null;
  const editing = draft ?? selected;
  const isNew = draft !== null && !articles.some((a) => a.id === draft.id);

  function startNew(): void {
    setDraft({ ...BLANK });
    setSelectedId(null);
    setErrors([]);
  }

  function pick(id: string): void {
    setSelectedId(id);
    setDraft(null);
    setErrors([]);
  }

  function patch(change: Partial<Article>): void {
    setDraft({ ...(editing ?? BLANK), ...change });
  }

  async function save(): Promise<void> {
    if (editing === null) return;
    setBusy(true);
    setErrors([]);

    const result = isNew
      ? await api.create<Article>("kb", editing)
      : await api.update<Article>("kb", editing.id, editing);

    if (!result.ok) {
      setErrors(result.errors);
    } else {
      setArticles((prev) =>
        isNew
          ? [...prev, result.item]
          : prev.map((a) => (a.id === result.item.id ? result.item : a)),
      );
      setSelectedId(result.item.id);
      setDraft(null);
      setSavedAt(Date.now());
      // The retriever indexes these, so anything showing article counts or running
      // an eval needs the new corpus.
      router.refresh();
    }
    setBusy(false);
  }

  async function remove(): Promise<void> {
    if (selected === null) return;
    setBusy(true);
    setErrors([]);

    const result = await api.remove("kb", selected.id);
    if (!result.ok) {
      setErrors(result.errors);
    } else {
      const remaining = articles.filter((a) => a.id !== selected.id);
      setArticles(remaining);
      setSelectedId(remaining[0]?.id ?? null);
      setDraft(null);
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <ManagerLayout
      list={
        <>
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] text-muted">
              {articles.length} article{articles.length === 1 ? "" : "s"}
            </span>
            <Button variant="primary" onClick={startNew}>
              + New
            </Button>
          </div>
          {articles.map((a) => (
            <ListRow
              key={a.id}
              active={a.id === selectedId}
              onClick={() => pick(a.id)}
              title={a.id}
              subtitle={a.title}
            />
          ))}
          {isNew && <ListRow active onClick={() => undefined} title="(new article)" />}
        </>
      }
      editor={
        editing === null ? (
          <p className="text-muted">Select an article, or create one.</p>
        ) : (
          <div className="flex flex-col gap-4 rounded border border-line bg-panel p-5">
            <Field label="id" hint="used in citations — lowercase, no spaces">
              <TextInput
                value={editing.id}
                disabled={!isNew}
                placeholder="kb-refund-policy"
                onChange={(e) => patch({ id: e.target.value })}
              />
            </Field>

            <Field label="title">
              <TextInput
                value={editing.title}
                placeholder="Refund policy for self-serve plans"
                onChange={(e) => patch({ title: e.target.value })}
              />
            </Field>

            <Field label="tags" hint="comma separated — the retriever weights these above body text">
              <ListInput
                value={editing.tags}
                placeholder="refund, billing, policy, 14 days"
                onChange={(tags) => patch({ tags })}
              />
            </Field>

            <Field label="body" hint="write the operational detail: exact errors, exact windows, exact settings paths">
              <TextArea
                rows={18}
                value={editing.body}
                placeholder={"Self-serve plans can be refunded within 14 days of purchase…"}
                onChange={(e) => patch({ body: e.target.value })}
              />
            </Field>

            <ErrorList errors={errors} />

            <div className="flex items-center gap-2">
              <Button variant="primary" disabled={busy} onClick={() => void save()}>
                {busy ? "saving…" : isNew ? "Create article" : "Save changes"}
              </Button>
              {!isNew && (
                <Button variant="danger" disabled={busy} onClick={() => void remove()}>
                  Delete
                </Button>
              )}
              {draft !== null && !isNew && (
                <Button onClick={() => setDraft(null)}>Discard</Button>
              )}
              <SavedFlash at={savedAt} />
              {editing.updatedAt !== "" && (
                <span className="ml-auto font-mono text-[11px] text-muted">
                  updated {editing.updatedAt}
                </span>
              )}
            </div>
          </div>
        )
      }
    />
  );
}
