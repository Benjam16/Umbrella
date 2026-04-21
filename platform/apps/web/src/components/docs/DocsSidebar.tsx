"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Section = {
  title: string;
  items: Array<{ href: string; label: string }>;
};

const SECTIONS: Section[] = [
  {
    title: "Getting Started",
    items: [
      { href: "/docs", label: "Introduction" },
      { href: "/docs/vision", label: "Vision" },
      { href: "/docs/quickstart", label: "Quickstart" },
      { href: "/docs/concepts", label: "Core concepts" },
    ],
  },
  {
    title: "Launchpad",
    items: [
      { href: "/docs/launchpad/overview", label: "Launchpad overview" },
      { href: "/docs/launchpad/wizard", label: "3-step wizard" },
      { href: "/docs/launchpad/treasury", label: "Treasury & fees" },
    ],
  },
  {
    title: "Agent OS",
    items: [
      { href: "/docs/os/workspace", label: "Workspace" },
      { href: "/docs/os/missions", label: "Missions & DAG" },
      { href: "/docs/os/eject", label: "Eject to local" },
    ],
  },
  {
    title: "Swarm Intelligence",
    items: [
      { href: "/docs/swarms/overview", label: "Swarm model" },
      { href: "/docs/swarms/roles", label: "Agent roles" },
      { href: "/docs/swarms/valkyrie", label: "Valkyrie protocol" },
    ],
  },
  {
    title: "Developer SDK",
    items: [
      { href: "/docs/sdk/api", label: "API surfaces" },
      { href: "/docs/sdk/webhooks", label: "Webhooks" },
      { href: "/docs/sdk/supabase", label: "Supabase integration" },
    ],
  },
];

export function DocsSidebar() {
  const pathname = usePathname();
  return (
    <aside className="sticky top-20 hidden h-fit w-64 flex-none rounded-xl border border-zinc-800 bg-ink-900/60 p-4 lg:block">
      <p className="font-mono text-[10px] uppercase tracking-widest text-signal-blue">
        Umbrella Docs
      </p>
      <div className="mt-4 space-y-4">
        {SECTIONS.map((section) => (
          <div key={section.title}>
            <p className="mb-1 px-1 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
              {section.title}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = pathname === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`block rounded-md px-2 py-1 text-sm transition ${
                        active
                          ? "bg-signal-blue/10 text-signal-blue"
                          : "text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100"
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </aside>
  );
}
