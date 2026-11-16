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

export function replaceState(next: AppState) {
  state = next;
  persist(next);
  emit();
}

export function resetDemo() {
  replaceState(initialState());
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
