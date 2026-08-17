import type { Metadata } from "next";
import { Nav } from "@/components/nav/Nav";
import { WorkspaceBar } from "@/components/nav/WorkspaceBar";
import "./globals.css";

export const metadata: Metadata = {
  title: "CX Agent Lab",
  description: "Author a support agent's knowledge, tests and prompts — then score it.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <Nav />
        <WorkspaceBar />
        {children}
      </body>
    </html>
  );
}
