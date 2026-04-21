"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

export type Toast = {
  id: number;
  title: string;
  body?: string;
  tone?: "info" | "success" | "warn" | "error";
  /** Optional command to render in a <code> block under the body. */
  command?: string;
  /** ms until auto-dismiss; omit for sticky. */
  duration?: number;
};

type ToastCtx = {
  push: (t: Omit<Toast, "id">) => number;
  dismiss: (id: number) => void;
};

const Ctx = createContext<ToastCtx | null>(null);

/**
 * Minimal app-wide toast provider. Renders into a fixed bottom-right stack.
 * No external deps — matches the Umbrella dark aesthetic.
 */
export function ToasterProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((xs) => xs.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = ++idRef.current;
      setToasts((xs) => [...xs, { ...t, id }]);
      const duration = t.duration ?? 4200;
      if (duration > 0) {
        setTimeout(() => dismiss(id), duration);
      }
      return id;
    },
    [dismiss],
  );

  return (
    <Ctx.Provider value={{ push, dismiss }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-end gap-2 p-4 sm:p-6">
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onClose={() => dismiss(t.id)} />
        ))}
      </div>
    </Ctx.Provider>
  );
}

function ToastCard({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const i = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(i);
  }, []);

  const accent =
    toast.tone === "success"
      ? "border-signal-green/50 bg-signal-green/10"
      : toast.tone === "warn"
        ? "border-signal-amber/50 bg-signal-amber/10"
        : toast.tone === "error"
          ? "border-signal-red/50 bg-signal-red/10"
          : "border-signal-blue/40 bg-signal-blue/10";

  return (
    <div
      className={`pointer-events-auto w-full max-w-sm rounded-xl border ${accent} bg-ink-950/90 p-3 shadow-lg backdrop-blur transition-all duration-200 ${
        entered ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <p className="text-sm font-semibold text-zinc-100">{toast.title}</p>
          {toast.body && <p className="mt-1 text-xs text-zinc-400">{toast.body}</p>}
          {toast.command && (
            <code className="mt-2 block rounded-md border border-zinc-800 bg-ink-950 px-2 py-1.5 font-mono text-[11px] text-signal-green">
              $ {toast.command}
            </code>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-[11px] uppercase tracking-wider text-zinc-500 hover:text-zinc-200"
          aria-label="dismiss"
        >
          ×
        </button>
      </div>
    </div>
  );
}

export function useToast(): ToastCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    return {
      push: () => 0,
      dismiss: () => {},
    };
  }
  return ctx;
}
