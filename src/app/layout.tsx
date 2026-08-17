import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "CX Agent Lab",
  description: "Trace recorder and evaluation harness for a support AI agent.",
};

/**
 * Grouped by what you are doing: run the exam, author what it grades, inspect the
 * result, or poke at a single ticket.
 */
const NAV = [
  { href: "/", label: "run" },
  { href: "/prompts", label: "prompts" },
  { href: "/tests", label: "tests" },
  { href: "/kb", label: "knowledge base" },
  { href: "/compare", label: "compare" },
  { href: "/runs", label: "history" },
  { href: "/playground", label: "playground" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav className="border-b border-line bg-panel">
          <div className="mx-auto flex max-w-6xl gap-5 px-6 py-2">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="font-mono text-xs text-muted hover:text-text"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
