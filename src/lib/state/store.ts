"use client";
/**
 * Client store with synchronous persistence. Demo mode keeps data in this
 * browser's localStorage (fictional data only). Every change is written
 * immediately; a failed write is surfaced to the user, never swallowed.
 */
import { useSyncExternalStore } from "react";
import { appStateSchema } from "./backup";
import { initialState, migrate, type AppState } from "./model";

export const STORAGE_KEY = "kitchen-blockcards:v1";

export type SaveStatus = { kind: "idle" } | { kind: "saved"; at: number } | { kind: "error"; message: string };

let state: AppState | null = null;
let saveStatus: SaveStatus = { kind: "idle" };
let loadWarning: string | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function load(): AppState {
  if (typeof window === "undefined") return initialState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState();
    const parsed = appStateSchema.safeParse(migrate(JSON.parse(raw)));
    if (parsed.success) {
      const next = parsed.data as unknown as AppState;
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    }
    // Keep the unreadable copy so nothing is lost; start fresh.
    window.localStorage.setItem(`${STORAGE_KEY}:unreadable:${Date.now()}`, raw);
    loadWarning = "Saved data could not be read, so a fresh demo was started. The old copy was kept in browser storage.";
    return initialState();
  } catch {
    loadWarning = "Browser storage is unavailable (private mode?). Changes will not survive closing the app.";
    return initialState();
  }
}

function persist(next: AppState) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    saveStatus = { kind: "saved", at: Date.now() };
  } catch (e) {
    saveStatus = { kind: "error", message: e instanceof Error ? e.message : "Could not save" };
  }
}

export function getState(): AppState {
  if (!state) state = load();
  return state;
}

/** Apply a pure update. Throws (without saving) if the update throws. */
export function dispatch(update: (s: AppState) => AppState): void {
  const next = update(getState());
  if (next === state) return;
  state = next;
  persist(next);
  emit();
}

const BEFORE_KEY = `${STORAGE_KEY}:before-replace`;

/** Keep one copy of the current data before a restore/reset so it can be undone. Best effort. */
function snapshot(label: string): boolean {
  try {
    window.localStorage.setItem(BEFORE_KEY, JSON.stringify({ label, at: new Date().toISOString(), state: getState() }));
    return true;
  } catch {
    return false; // not enough room for a second copy — the caller already confirmed with the user
  }
}

export function replaceState(next: AppState, undoLabel?: string) {
  if (undoLabel) snapshot(undoLabel);
  state = next;
  persist(next);
  emit();
}

export function resetDemo() {
  replaceState(initialState(), "reset");
}

export function lastReplace(): { label: string; at: string } | null {
  try {
    const raw = window.localStorage.getItem(BEFORE_KEY);
    if (!raw) return null;
    const { label, at } = JSON.parse(raw) as { label: string; at: string };
    return { label, at };
  } catch {
    return null;
  }
}

/** Put back the data from before the last restore/reset. */
export function undoLastReplace(): boolean {
  try {
    const raw = window.localStorage.getItem(BEFORE_KEY);
    if (!raw) return false;
    const parsed = appStateSchema.safeParse(migrate(JSON.parse(raw).state));
    if (!parsed.success) return false;
    state = parsed.data as unknown as AppState;
    persist(state);
    window.localStorage.removeItem(BEFORE_KEY);
    emit();
    return true;
  } catch {
    return false;
  }
}

/** Approximate browser storage use. Safari/Chrome allow ~5 MB (UTF-16) per site for localStorage. */
export const STORAGE_QUOTA_BYTES = 5 * 1024 * 1024;
export function storageStats(): { bytes: number; pct: number } {
  let chars = 0;
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k?.startsWith("kitchen-blockcards")) chars += k.length + (window.localStorage.getItem(k)?.length ?? 0);
    }
  } catch {
    /* storage unavailable */
  }
  const bytes = chars * 2;
  return { bytes, pct: Math.round((bytes / STORAGE_QUOTA_BYTES) * 100) };
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY && e.newValue) {
      try {
        const parsed = appStateSchema.safeParse(migrate(JSON.parse(e.newValue)));
        if (parsed.success) {
          state = parsed.data as unknown as AppState;
          emit();
        }
      } catch {
        /* ignore malformed cross-tab writes */
      }
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

const serverSnapshot = initialState();

export function useAppState<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(getState()),
    () => selector(serverSnapshot),
  );
}

export function useSaveStatus(): SaveStatus {
  return useSyncExternalStore(
    subscribe,
    () => saveStatus,
    () => saveStatus,
  );
}

export function consumeLoadWarning(): string | null {
  const w = loadWarning;
  loadWarning = null;
  return w;
}
