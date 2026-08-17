"use client";

import { useState } from "react";

/**
 * Form primitives shared by the three authoring screens.
 *
 * Small and unabstracted on purpose. Three editors with slightly different shapes
 * are easier to read than one configurable editor that has to describe all three,
 * so these are the pieces they have in common and nothing more.
 */

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[11px] text-muted">
        {label}
        {hint !== undefined && <span className="ml-2 normal-case opacity-70">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

const inputClass =
  "rounded border border-line bg-panel px-3 py-2 text-sm placeholder:text-muted/50 focus:border-info focus:outline-none disabled:opacity-50";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${inputClass} ${props.className ?? ""}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={`${inputClass} font-mono text-xs ${props.className ?? ""}`} />
  );
}

/** Comma-separated text in, clean array out. Simpler than chips, and paste-friendly. */
export function ListInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  const [text, setText] = useState(value.join(", "));
  return (
    <TextInput
      value={text}
      placeholder={placeholder}
      onChange={(e) => {
        setText(e.target.value);
        onChange(
          e.target.value
            .split(",")
            .map((v) => v.trim())
            .filter((v) => v !== ""),
        );
      }}
    />
  );
}

/**
 * Every validation failure at once, rather than one per save.
 *
 * The server collects them for exactly this: fixing a form one error at a time is
 * the difference between a tool people use and a tool people avoid.
 */
export function ErrorList({ errors }: { errors: string[] }) {
  if (errors.length === 0) return null;
  return (
    <div className="rounded border border-fail/50 bg-fail/10 px-3 py-2">
      <ul className="flex flex-col gap-1">
        {errors.map((e) => (
          <li key={e} className="font-mono text-xs text-fail">
            {e}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Button({
  variant = "default",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "default" | "danger" }) {
  const styles = {
    primary: "bg-info text-ink font-semibold hover:opacity-90",
    default: "border border-line hover:bg-raised",
    danger: "border border-fail/50 text-fail hover:bg-fail/10",
  }[variant];

  return (
    <button
      {...props}
      className={`rounded px-3 py-1.5 font-mono text-xs disabled:opacity-40 ${styles} ${props.className ?? ""}`}
    />
  );
}

/** Two-pane shell: a list you pick from, and the editor for what you picked. */
export function ManagerLayout({
  list,
  editor,
}: {
  list: React.ReactNode;
  editor: React.ReactNode;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(220px,300px)_1fr]">
      <div className="flex flex-col gap-2">{list}</div>
      <div className="min-w-0">{editor}</div>
    </div>
  );
}

export function ListRow({
  active,
  onClick,
  title,
  subtitle,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full rounded border px-3 py-2 text-left ${
        active ? "border-info bg-raised" : "border-line hover:bg-raised"
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate font-mono text-xs">{title}</span>
        {badge}
      </div>
      {subtitle !== undefined && (
        <div className="mt-0.5 truncate text-[11px] text-muted">{subtitle}</div>
      )}
    </button>
  );
}
