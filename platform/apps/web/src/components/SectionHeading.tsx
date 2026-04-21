import type { ReactNode } from "react";

type Props = {
  eyebrow: string;
  title: ReactNode;
  subtitle?: ReactNode;
};

export function SectionHeading({ eyebrow, title, subtitle }: Props) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-signal-blue">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl md:text-4xl">
        {title}
      </h2>
      {subtitle ? (
        <p className="mt-3 text-sm leading-relaxed text-zinc-400 sm:text-base">{subtitle}</p>
      ) : null}
    </div>
  );
}
