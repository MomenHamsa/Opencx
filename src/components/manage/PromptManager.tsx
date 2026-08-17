"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Button,
  ErrorList,
  Field,
  ListRow,
  ManagerLayout,
  SavedFlash,
  TextArea,
  TextInput,
} from "@/components/ui/form";
import { api } from "@/lib/workspace/client";
import type { PromptVersion } from "@/lib/types";

/**
 * The prompt editor.
 *
 * One rule shapes this whole screen: **a prompt that has been evaluated is frozen.**
 * A score is attached to that exact wording, so editing it afterwards would quietly
 * rewrite the meaning of every run and every baseline that referenced it. Versions
 * with runs show a lock and offer "Save as new version" instead.
 *
 * That is not bureaucracy — it is the only reason the baseline diff can be trusted.
 */

const BLANK: PromptVersion = { id: "", label: "", changelog: "", system: "" };

export function PromptManager({
  initial,
  runCounts,
  simulatableIds,
}: {
  initial: PromptVersion[];
  runCounts: Record<string, number>;
  /** Prompts the offline mock can meaningfully simulate. Everything else needs a real model. */
  simulatableIds: string[];
}) {
  const router = useRouter();
  const [prompts, setPrompts] = useState(initial);
  const [selectedId, setSelectedId] = useState<string | null>(initial[0]?.id ?? null);
  const [draft, setDraft] = useState<PromptVersion | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const selected = prompts.find((p) => p.id === selectedId) ?? null;
  const editing = draft ?? selected;
  const isNew = draft !== null && !prompts.some((p) => p.id === draft.id);
  const runs = editing === null || isNew ? 0 : (runCounts[editing.id] ?? 0);
  const frozen = runs > 0;

  function suggestNextId(): string {
    const numbers = prompts
      .map((p) => /^v(\d+)$/.exec(p.id)?.[1])
      .filter((n): n is string => n !== undefined)
      .map(Number);
    return `v${(numbers.length === 0 ? 0 : Math.max(...numbers)) + 1}`;
  }

  function patch(change: Partial<PromptVersion>): void {
    setDraft({ ...(editing ?? BLANK), ...change });
  }

  /** Copy the current text into a fresh version — the way you edit a frozen prompt. */
  function forkFromCurrent(): void {
    if (editing === null) return;
    setDraft({ ...editing, id: suggestNextId(), changelog: "" });
    setSelectedId(null);
    setErrors([]);
  }

  async function save(): Promise<void> {
    if (editing === null) return;
    setBusy(true);
    setErrors([]);

    const result = isNew
      ? await api.create<PromptVersion>("prompts", editing)
      : await api.update<PromptVersion>("prompts", editing.id, editing);

    if (!result.ok) {
      setErrors(result.errors);
    } else {
      setPrompts((prev) =>
        isNew ? [...prev, result.item] : prev.map((p) => (p.id === result.item.id ? result.item : p)),
      );
      setSelectedId(result.item.id);
      setDraft(null);
      setSavedAt(Date.now());
      router.refresh();
    }
    setBusy(false);
  }

  async function remove(): Promise<void> {
    if (selected === null) return;
    setBusy(true);
    setErrors([]);
    const result = await api.remove("prompts", selected.id);
    if (!result.ok) {
      setErrors(result.errors);
    } else {
      const remaining = prompts.filter((p) => p.id !== selected.id);
      setPrompts(remaining);
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
              {prompts.length} version{prompts.length === 1 ? "" : "s"}
            </span>
            <Button
              variant="primary"
              onClick={() => {
                setDraft({ ...BLANK, id: suggestNextId() });
                setSelectedId(null);
                setErrors([]);
              }}
            >
              + New
            </Button>
          </div>
          {prompts.map((p) => {
            const count = runCounts[p.id] ?? 0;
            return (
              <ListRow
                key={p.id}
                active={p.id === selectedId}
                onClick={() => {
                  setSelectedId(p.id);
                  setDraft(null);
                  setErrors([]);
                }}
                title={p.id}
                subtitle={p.label}
                badge={
                  count > 0 ? (
                    <span title={`${count} saved run(s) — text is frozen`} className="text-[10px]">
                      🔒
                    </span>
                  ) : (
                    <span className="font-mono text-[10px] text-muted">draft</span>
                  )
                }
              />
            );
          })}
          {isNew && <ListRow active onClick={() => undefined} title="(new version)" />}
        </>
      }
      editor={
        editing === null ? (
          <p className="text-muted">Select a prompt version, or create one.</p>
        ) : (
          <div className="flex flex-col gap-4 rounded border border-line bg-panel p-5">
            {frozen && (
              <div className="rounded border border-info/50 bg-info/10 px-3 py-2 text-xs">
                <span className="font-mono font-semibold text-info">frozen</span> — this version has
                been evaluated {runs} time{runs === 1 ? "" : "s"}, and a score is attached to this
                exact wording. Use <span className="font-mono">Save as new version</span> to change
                it; editing in place would rewrite the meaning of every run that referenced it.
              </div>
            )}

            {!isNew && !simulatableIds.includes(editing.id) && (
              <div className="rounded border border-warn/50 bg-warn/10 px-3 py-2 text-xs text-warn">
                The offline mock only simulates the two bundled prompts — it recognises five
                specific phrases and nothing else. Evaluate this version against a real model, or
                the score will be meaningless.
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="id" hint="v3, v4 — append-only">
                <TextInput
                  value={editing.id}
                  disabled={!isNew}
                  onChange={(e) => patch({ id: e.target.value })}
                />
              </Field>
              <Field label="label">
                <TextInput
                  value={editing.label}
                  disabled={frozen}
                  placeholder="hardened + refund carve-out"
                  onChange={(e) => patch({ label: e.target.value })}
                />
              </Field>
            </div>

            <Field
              label="changelog"
              hint="what changed and why — name the failure this version was written against"
            >
              <TextArea
                rows={4}
                value={editing.changelog}
                disabled={frozen}
                placeholder="Adds an escalation rule for renewal refunds, after v2 promised money it cannot move on T-009."
                onChange={(e) => patch({ changelog: e.target.value })}
              />
            </Field>

            <Field label="system prompt">
              <TextArea
                rows={24}
                value={editing.system}
                disabled={frozen}
                className="font-mono text-xs"
                onChange={(e) => patch({ system: e.target.value })}
              />
            </Field>

            <ErrorList errors={errors} />

            <div className="flex flex-wrap items-center gap-2">
              {!frozen && (
                <Button variant="primary" disabled={busy} onClick={() => void save()}>
                  {busy ? "saving…" : isNew ? "Create version" : "Save changes"}
                </Button>
              )}
              <Button variant={frozen ? "primary" : "default"} onClick={forkFromCurrent}>
                Save as new version
              </Button>
              {!isNew && !frozen && (
                <Button variant="danger" disabled={busy} onClick={() => void remove()}>
                  Delete
                </Button>
              )}
              {draft !== null && !isNew && <Button onClick={() => setDraft(null)}>Discard</Button>}
              <SavedFlash at={savedAt} />
              <span className="ml-auto font-mono text-[11px] text-muted">
                {editing.system.length} characters
              </span>
            </div>
          </div>
        )
      }
    />
  );
}
