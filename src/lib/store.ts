import { useSyncExternalStore } from "react";
import {
  CHANNELS,
  ME_ID,
  SEED_VIDEOS,
  type Channel,
  type Comment,
  type Video,
} from "./data";

export interface Playlist {
  id: string;
  name: string;
  videoIds: string[];
  createdAt: string;
}

export interface State {
  theme: "dark" | "light";
  subscriptions: string[];
  liked: string[];
  disliked: string[];
  watchLater: string[];
  history: { id: string; at: string }[];
  playlists: Playlist[];
  comments: Comment[];
  likedComments: string[];
  uploads: Video[];
  edits: Record<string, Partial<Video>>;
  deleted: string[];
  me: Partial<Channel>;
  searches: string[];
}

const KEY = "arinx-state-v1";
const initial: State = {
  theme: "dark",
  subscriptions: ["quanta", "saffron", "pixel"],
  liked: [],
  disliked: [],
  watchLater: [],
  history: [],
  playlists: [],
  comments: [],
  likedComments: [],
  uploads: [],
  edits: {},
  deleted: [],
  me: {},
  searches: [],
};

let state: State = initial;
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

export function setState(fn: (s: State) => Partial<State>) {
  load();
  state = { ...state, ...fn(state) };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* quota */
  }
  listeners.forEach((l) => l());
}

export function useAppState(): State {
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

export const toggleIn = (arr: string[], id: string) =>
  arr.includes(id) ? arr.filter((x) => x !== id) : [id, ...arr];

export const uid = () => Date.now().toString(36) + Math.floor(performance.now() * 1000).toString(36);

// ---- selectors ----
export function getChannels(s: State): Channel[] {
  return CHANNELS.map((c) => (c.id === ME_ID ? { ...c, ...s.me } : c));
}
export function getChannel(s: State, id: string) {
  return getChannels(s).find((c) => c.id === id);
}
export function allVideos(s: State): Video[] {
  return [...s.uploads, ...SEED_VIDEOS]
    .filter((v) => !s.deleted.includes(v.id))
    .map((v) => (s.edits[v.id] ? { ...v, ...s.edits[v.id] } : v));
}
export function publicVideos(s: State) {
  return allVideos(s).filter((v) => v.visibility === "public");
}
export function getVideo(s: State, id: string) {
  return allVideos(s).find((v) => v.id === id);
}

export function recommend(s: State, exclude?: string): Video[] {
  const vids = publicVideos(s).filter((v) => !v.isShort && v.id !== exclude);
  const watched = new Set(s.history.map((h) => h.id));
  const catScore: Record<string, number> = {};
  for (const h of s.history.slice(0, 30)) {
    const v = vids.find((x) => x.id === h.id);
    if (v) catScore[v.category] = (catScore[v.category] ?? 0) + 1;
  }
  const score = (v: Video) =>
    Math.log10(v.views + 10) +
    (catScore[v.category] ?? 0) * 0.8 +
    (s.subscriptions.includes(v.channelId) ? 1.5 : 0) -
    (watched.has(v.id) ? 2 : 0) +
    ((v.id.charCodeAt(1) * 13) % 10) / 10;
  return [...vids].sort((a, b) => score(b) - score(a));
}

// ---- file storage for uploads (IndexedDB) ----
function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open("arinx-files", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("files");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
export async function putFile(key: string, blob: Blob) {
  const d = await db();
  await new Promise((res, rej) => {
    const tx = d.transaction("files", "readwrite");
    tx.objectStore("files").put(blob, key);
    tx.oncomplete = res;
    tx.onerror = () => rej(tx.error);
  });
}
export async function getFile(key: string): Promise<Blob | undefined> {
  const d = await db();
  return new Promise((res) => {
    const r = d.transaction("files").objectStore("files").get(key);
    r.onsuccess = () => res(r.result);
    r.onerror = () => res(undefined);
  });
}
