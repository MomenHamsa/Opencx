import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "CX Agent Lab",
  description: "Trace recorder and evaluation harness for a support AI agent.",
};

const NAV = [
  { href: "/", label: "eval run" },
  { href: "/prompts", label: "prompt diff" },
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
