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
  Select,
  TextArea,
  TextInput,
} from "@/components/ui/form";
import { api } from "@/lib/workspace/client";
import { ACTIONS, CHANNELS, INTENTS } from "@/lib/types";
import type { Article, GoldenCase } from "@/lib/types";

/**
 * The test editor — the exam.
 *
 * The rule worth holding to while writing these: an expectation encodes *policy*,
 * not the wording of an answer. "Did it escalate" and "did it cite the article that
 * holds the answer" are things a support lead would sign off on. "Did it use the
 * phrase 'I'm sorry'" is not, and grading it just adds noise to the score.
 *
 * Leave `intent` blank when a ticket is genuinely two things at once. Grading a
 * judgement call as if it had one right answer measures your opinion, not the agent.
 */

const BLANK: GoldenCase = {
  ticket: { id: "", customerEmail: "", channel: "email", subject: "", body: "" },
  expect: { action: "reply" },
  note: "",
};

export function TestManager({
  initial,
  articles,
}: {
  initial: GoldenCase[];
  articles: Article[];
}) {
  const router = useRouter();
  const [cases, setCases] = useState(initial);
  const [selectedId, setSelectedId] = useState<string | null>(initial[0]?.ticket.id ?? null);
  const [draft, setDraft] = useState<GoldenCase | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const selected = cases.find((c) => c.ticket.id === selectedId) ?? null;
  const editing = draft ?? selected;
  const isNew = draft !== null && !cases.some((c) => c.ticket.id === draft.ticket.id);

  function patchTicket(change: Partial<GoldenCase["ticket"]>): void {
    const base = editing ?? BLANK;
    setDraft({ ...base, ticket: { ...base.ticket, ...change } });
  }

  function patchExpect(change: Partial<GoldenCase["expect"]>): void {
    const base = editing ?? BLANK;
    setDraft({ ...base, expect: { ...base.expect, ...change } });
  }

  async function save(): Promise<void> {
    if (editing === null) return;
    setBusy(true);
    setErrors([]);

    const result = isNew
      ? await api.create<GoldenCase>("tests", editing)
      : await api.update<GoldenCase>("tests", editing.ticket.id, editing);

    if (!result.ok) {
      setErrors(result.errors);
    } else {
      setCases((prev) =>
        isNew
          ? [...prev, result.item]
          : prev.map((c) => (c.ticket.id === result.item.ticket.id ? result.item : c)),
      );
      setSelectedId(result.item.ticket.id);
      setDraft(null);
      router.refresh();
    }
    setBusy(false);
  }

  async function remove(): Promise<void> {
    if (selected === null) return;
    setBusy(true);
    setErrors([]);
    const result = await api.remove("tests", selected.ticket.id);
    if (!result.ok) {
      setErrors(result.errors);
    } else {
      const remaining = cases.filter((c) => c.ticket.id !== selected.ticket.id);
      setCases(remaining);
      setSelectedId(remaining[0]?.ticket.id ?? null);
      setDraft(null);
      router.refresh();
    }
    setBusy(false);
  }

  const escalations = cases.filter((c) => c.expect.action === "escalate").length;

  return (
    <ManagerLayout
      list={
        <>
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] text-muted">
              {cases.length} test{cases.length === 1 ? "" : "s"} · {escalations} escalate
            </span>
            <Button
              variant="primary"
              onClick={() => {
                setDraft({ ...BLANK });
                setSelectedId(null);
                setErrors([]);
              }}
            >
              + New
            </Button>
          </div>
          {cases.map((c) => (
            <ListRow
              key={c.ticket.id}
              active={c.ticket.id === selectedId}
              onClick={() => {
                setSelectedId(c.ticket.id);
                setDraft(null);
                setErrors([]);
              }}
              title={c.ticket.id}
              subtitle={c.ticket.subject}
              badge={
                <span
                  className={`font-mono text-[10px] ${
                    c.expect.action === "escalate" ? "text-warn" : "text-muted"
                  }`}
                >
                  {c.expect.action}
                </span>
              }
            />
          ))}
          {isNew && <ListRow active onClick={() => undefined} title="(new test)" />}
        </>
      }
      editor={
        editing === null ? (
          <p className="text-muted">Select a test, or create one.</p>
        ) : (
          <div className="flex flex-col gap-5">
            <section className="flex flex-col gap-4 rounded border border-line bg-panel p-5">
              <h2 className="font-mono text-xs tracking-wide text-muted uppercase">The ticket</h2>

              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="id">
                  <TextInput
                    value={editing.ticket.id}
                    disabled={!isNew}
                    placeholder="T-015"
                    onChange={(e) => patchTicket({ id: e.target.value })}
                  />
                </Field>
                <Field label="customer email">
                  <TextInput
                    value={editing.ticket.customerEmail}
                    placeholder="ops@customer.com"
                    onChange={(e) => patchTicket({ customerEmail: e.target.value })}
                  />
                </Field>
                <Field label="channel">
                  <Select
                    value={editing.ticket.channel}
                    onChange={(e) =>
                      patchTicket({ channel: e.target.value as GoldenCase["ticket"]["channel"] })
                    }
                  >
                    {CHANNELS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <Field label="subject">
                <TextInput
                  value={editing.ticket.subject}
                  onChange={(e) => patchTicket({ subject: e.target.value })}
                />
              </Field>

              <Field label="body" hint="write it the way an annoyed customer actually would">
                <TextArea
                  rows={10}
                  value={editing.ticket.body}
                  onChange={(e) => patchTicket({ body: e.target.value })}
                />
              </Field>
            </section>

            <section className="flex flex-col gap-4 rounded border border-line bg-panel p-5">
              <h2 className="font-mono text-xs tracking-wide text-muted uppercase">
                What a good agent must do
              </h2>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="action" hint="required">
                  <Select
                    value={editing.expect.action}
                    onChange={(e) =>
                      patchExpect({ action: e.target.value as GoldenCase["expect"]["action"] })
                    }
                  >
                    {ACTIONS.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="intent" hint="leave blank if the ticket is genuinely two things at once">
                  <Select
                    value={editing.expect.intent ?? ""}
                    onChange={(e) =>
                      patchExpect({
                        intent:
                          e.target.value === ""
                            ? undefined
                            : (e.target.value as GoldenCase["expect"]["intent"]),
                      })
                    }
                  >
                    <option value="">— not graded —</option>
                    {INTENTS.map((i) => (
                      <option key={i} value={i}>
                        {i}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <Field
                label="must cite any of"
                hint="article ids — the reply passes if it cites at least one"
              >
                <ListInput
                  value={editing.expect.citesAnyOf ?? []}
                  placeholder="kb-refund-policy"
                  onChange={(citesAnyOf) => patchExpect({ citesAnyOf })}
                />
              </Field>
              <p className="-mt-2 font-mono text-[11px] text-muted">
                available: {articles.map((a) => a.id).join(" · ") || "none yet"}
              </p>

              <Field
                label="must not contain"
                hint="case-insensitive phrases the reply may never include"
              >
                <ListInput
                  value={editing.expect.mustNotContain ?? []}
                  placeholder="i have processed, 100% discount"
                  onChange={(mustNotContain) => patchExpect({ mustNotContain })}
                />
              </Field>

              <Field label="note" hint="why this test exists — for whoever reads it in six months">
                <TextArea
                  rows={3}
                  value={editing.note}
                  onChange={(e) => setDraft({ ...(editing ?? BLANK), note: e.target.value })}
                />
              </Field>

              <ErrorList errors={errors} />

              <div className="flex items-center gap-2">
                <Button variant="primary" disabled={busy} onClick={() => void save()}>
                  {busy ? "saving…" : isNew ? "Create test" : "Save changes"}
                </Button>
                {!isNew && (
                  <Button variant="danger" disabled={busy} onClick={() => void remove()}>
                    Delete
                  </Button>
                )}
                {draft !== null && !isNew && <Button onClick={() => setDraft(null)}>Discard</Button>}
              </div>
            </section>
          </div>
        )
      }
    />
  );
}
