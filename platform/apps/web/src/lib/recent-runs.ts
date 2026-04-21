"use client";

/**
 * Client-side cache of recently-started runs. Powers the sidebar "recent
 * missions" list and /app/runs history when the visitor isn't authenticated.
 * When Supabase Auth lands, this becomes a fallback for the server-backed list.
 */

const STORAGE_KEY = "umbrella.recentRuns";
const MAX = 50;

export type RecentRun = {
  id: string;
  blueprintId: string;
  blueprintTitle: string;
  goal: string;
  mode: "cloud" | "remote";
  createdAt: string;
  origin: "cloud" | "remote";
};

export function loadRecentRuns(): RecentRun[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentRun[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function rememberRecentRun(run: RecentRun) {
  if (typeof window === "undefined") return;
  const existing = loadRecentRuns().filter((r) => r.id !== run.id);
  const next = [run, ...existing].slice(0, MAX);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("umbrella:recent-runs-updated"));
}

export function clearRecentRuns() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent("umbrella:recent-runs-updated"));
}
