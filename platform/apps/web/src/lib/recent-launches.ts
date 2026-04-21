"use client";

/**
 * Tiny client-side store for the "Instant Workspace Replay" flow.
 *
 * When the Forge wizard gets a 200 from /api/v1/forge/launch, we stash a
 * pending launch in localStorage and redirect the user to /app/workspace. The
 * workspace reads that list, shows each pending launch with an
 * "Initializing..." chip, and upgrades it to "Ready" when the Supabase
 * Realtime INSERT arrives (or when /api/v1/forge/hooks returns the row).
 */

export type PendingLaunchStatus = "initializing" | "generating" | "ready" | "error";

export type PendingLaunch = {
  /** Supabase row id once we have it, otherwise a client-generated UUID. */
  id: string;
  /** Mirrors the Forge row primary key once known. */
  hookId?: string;
  walletAddress: string;
  name: string;
  symbol: string;
  category: string;
  prompt: string;
  model?: string;
  status: PendingLaunchStatus;
  error?: string;
  /** ms since epoch — used to sort and to auto-expire stale entries. */
  createdAt: number;
};

const KEY = "umbrella.pendingLaunches.v1";
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h

function read(): PendingLaunch[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PendingLaunch[];
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed.filter(
      (p) =>
        p &&
        typeof p.id === "string" &&
        typeof p.createdAt === "number" &&
        now - p.createdAt < MAX_AGE_MS,
    );
  } catch {
    return [];
  }
}

function write(list: PendingLaunch[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch {
    /* quota exceeded — drop silently, the UI will fall back to the next load */
  }
}

export const EVENT_NAME = "umbrella:pending-launches-changed";

export function listPendingLaunches(): PendingLaunch[] {
  return read().sort((a, b) => b.createdAt - a.createdAt);
}

export function upsertPendingLaunch(entry: PendingLaunch): PendingLaunch[] {
  const list = read();
  const idx = list.findIndex((p) => p.id === entry.id);
  if (idx >= 0) list[idx] = { ...list[idx], ...entry };
  else list.unshift(entry);
  write(list);
  return list;
}

export function markLaunchReady(
  id: string,
  patch: Partial<Pick<PendingLaunch, "hookId" | "model">> = {},
): void {
  const list = read();
  const idx = list.findIndex((p) => p.id === id || p.hookId === id);
  if (idx < 0) return;
  list[idx] = { ...list[idx], ...patch, status: "ready" };
  write(list);
}

export function markLaunchError(id: string, error: string): void {
  const list = read();
  const idx = list.findIndex((p) => p.id === id);
  if (idx < 0) return;
  list[idx] = { ...list[idx], status: "error", error };
  write(list);
}

export function clearLaunch(id: string): void {
  write(read().filter((p) => p.id !== id && p.hookId !== id));
}

/**
 * React hook that stays in sync with localStorage across tabs (via `storage`
 * events) and within the current tab (via our dispatched `CustomEvent`).
 */
import { useEffect, useState } from "react";

export function usePendingLaunches(): PendingLaunch[] {
  const [list, setList] = useState<PendingLaunch[]>([]);
  useEffect(() => {
    setList(listPendingLaunches());
    const handle = () => setList(listPendingLaunches());
    window.addEventListener(EVENT_NAME, handle);
    window.addEventListener("storage", handle);
    return () => {
      window.removeEventListener(EVENT_NAME, handle);
      window.removeEventListener("storage", handle);
    };
  }, []);
  return list;
}

export function newLaunchId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `launch-${Date.now().toString(16)}-${Math.floor(Math.random() * 1e6).toString(16)}`;
}
