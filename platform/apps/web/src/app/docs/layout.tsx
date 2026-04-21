import type { Metadata } from "next";
import { AppTopNav } from "@/components/app/AppTopNav";
import { DocsSidebar } from "@/components/docs/DocsSidebar";

export const metadata: Metadata = {
  title: "Umbrella Docs",
  description:
    "Complete documentation for Umbrella: the autonomous launchpad for agent tokens and swarm operations.",
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ink-950 text-zinc-100">
      <AppTopNav />
      <div className="mx-auto flex w-full max-w-7xl gap-8 px-6 py-8">
        <DocsSidebar />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
