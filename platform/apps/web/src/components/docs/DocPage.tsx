import Link from "next/link";

type Props = {
  eyebrow?: string;
  title: string;
  lead?: string;
  children: React.ReactNode;
  next?: { href: string; label: string };
};

export function DocPage({ eyebrow, title, lead, children, next }: Props) {
  return (
    <article className="max-w-3xl space-y-6 text-sm leading-relaxed text-zinc-300">
      <header className="space-y-2">
        {eyebrow && (
          <p className="font-mono text-[10px] uppercase tracking-widest text-signal-blue">
            {eyebrow}
          </p>
        )}
        <h1 className="text-3xl font-semibold text-zinc-100">{title}</h1>
        {lead && <p className="text-base text-zinc-400">{lead}</p>}
      </header>
      <div className="prose-invert space-y-4 text-zinc-300">{children}</div>
      {next && (
        <div className="mt-10 rounded-xl border border-zinc-800 bg-ink-900/60 p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
            Next
          </p>
          <Link
            href={next.href}
            className="mt-1 inline-block text-sm font-semibold text-signal-blue hover:underline"
          >
            {next.label} →
          </Link>
        </div>
      )}
    </article>
  );
}

export function H2({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <h2
      id={id}
      className="mt-10 scroll-mt-24 text-xl font-semibold text-zinc-100"
    >
      {children}
    </h2>
  );
}

export function H3({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <h3
      id={id}
      className="mt-6 scroll-mt-24 text-base font-semibold text-zinc-100"
    >
      {children}
    </h3>
  );
}

export function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm leading-relaxed text-zinc-300">{children}</p>;
}

export function UL({ children }: { children: React.ReactNode }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-zinc-300 marker:text-zinc-600">
      {children}
    </ul>
  );
}

export function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-ink-900 px-1.5 py-0.5 font-mono text-[12px] text-signal-amber">
      {children}
    </code>
  );
}

export function Callout({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "warn";
  title?: string;
  children: React.ReactNode;
}) {
  const cls =
    tone === "warn"
      ? "border-signal-amber/40 bg-signal-amber/5 text-signal-amber"
      : "border-signal-blue/40 bg-signal-blue/5 text-signal-blue";
  return (
    <aside className={`rounded-lg border p-4 text-xs ${cls}`}>
      {title && (
        <p className="mb-1 font-mono uppercase tracking-widest text-[10px]">
          {title}
        </p>
      )}
      <div className="text-zinc-200">{children}</div>
    </aside>
  );
}
