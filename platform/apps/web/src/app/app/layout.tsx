import { AppSidebar } from "@/components/app/AppSidebar";
import { ToasterProvider } from "@/components/Toaster";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Umbrella — Agentic Workspace",
  description:
    "Full-screen agent terminal. Describe a mission, watch the DAG build live, eject to your local CLI when sovereignty matters.",
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToasterProvider>
      <div className="flex h-screen w-screen overflow-hidden bg-ink-950 text-zinc-100">
        <AppSidebar />
        <div className="flex flex-1 flex-col overflow-hidden">{children}</div>
      </div>
    </ToasterProvider>
  );
}
