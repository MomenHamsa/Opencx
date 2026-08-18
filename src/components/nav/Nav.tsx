"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Navigation, grouped by what you are trying to do.
 *
 * Seven flat lowercase links told you nothing about the order to use them in, and
 * had no active state at all — you could not tell which page you were on. The shape
 * below follows the actual loop:
 *
 *   AUTHOR what gets graded  →  RUN the exam  →  INSPECT what happened
 *
 * Run sits apart on the left as a filled button, because it is both the home page
 * and the thing you came to do. Author comes before Inspect in reading order for the
 * same reason the dependency runs that way: tests cite articles, so the knowledge
 * base has to exist first.
 */

const GROUPS: { label: string; items: { href: string; label: string }[] }[] = [
  {
    label: "author",
    items: [
      { href: "/kb", label: "Knowledge" },
      { href: "/tests", label: "Tests" },
      { href: "/prompts", label: "Prompts" },
    ],
  },
  {
    label: "inspect",
    items: [
      { href: "/compare", label: "Compare" },
      { href: "/runs", label: "History" },
    ],
  },
  {
    label: "try",
    items: [{ href: "/playground", label: "Playground" }],
  },
];

export function Nav() {
  const pathname = usePathname();
  const onRun = pathname === "/";

  return (
    <nav className="border-b border-line bg-panel">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-2.5">
        <span className="font-mono text-xs font-semibold tracking-tight text-text">
          CX Agent Lab
        </span>

        {/* The primary action, and the only filled element in the bar. */}
        <Link
          href="/"
          aria-current={onRun ? "page" : undefined}
          className={`rounded-md px-3 py-1 font-mono text-xs font-semibold transition-colors ${
            onRun
              ? "bg-accent-strong text-white"
              : "border border-line text-muted hover:border-accent hover:text-text"
          }`}
        >
          Run eval
        </Link>

        {GROUPS.map((group) => (
          <div key={group.label} className="flex items-center gap-3">
            <span className="eyebrow">{group.label}</span>
            {group.items.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`border-b-2 pb-0.5 text-xs transition-colors ${
                    active
                      ? "border-accent text-text"
                      : "border-transparent text-muted hover:text-text"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </div>
    </nav>
  );
}
