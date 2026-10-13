import { useSyncExternalStore } from "react";

/** Device-only preferences (theme, recent searches). All app data lives in Lovable Cloud. */
export interface Prefs {
  theme: "dark" | "light";
  searches: string[];
}

const KEY = "arinx-prefs-v1";
const initial: Prefs = { theme: "dark", searches: [] };
let state: Prefs = initial;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) state = { ...initial, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
}

export function setPrefs(fn: (s: Prefs) => Partial<Prefs>) {
  load();
  state = { ...state, ...fn(state) };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => {
      load();
      return state;
    },
    () => initial,
  );
}
