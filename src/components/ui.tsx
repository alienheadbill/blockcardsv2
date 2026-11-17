"use client";
import { useEffect, useRef, useState, useSyncExternalStore, type ButtonHTMLAttributes, type ReactNode } from "react";
import { dispatch } from "@/lib/state/store";
import type { AppState } from "@/lib/state/model";
import { Icon } from "./Icon";

// ───────────────────────── toasts ─────────────────────────

type Toast = { id: number; kind: "error" | "info"; text: string };
let toasts: Toast[] = [];
let toastId = 0;
const toastListeners = new Set<() => void>();
const emitToasts = () => toastListeners.forEach((l) => l());

export function toast(text: string, kind: Toast["kind"] = "info") {
  const id = ++toastId;
  toasts = [...toasts, { id, kind, text }];
  emitToasts();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emitToasts();
  }, kind === "error" ? 6000 : 2500);
}

export function Toasts() {
  const list = useSyncExternalStore(
    (l) => {
      toastListeners.add(l);
      return () => toastListeners.delete(l);
    },
    () => toasts,
    () => toasts,
  );
  return (
    <div className="pointer-events-none fixed inset-x-0 top-2 z-[60] flex flex-col items-center gap-2 px-4" aria-live="assertive">
      {list.map((t) => (
        <div
          key={t.id}
          role={t.kind === "error" ? "alert" : "status"}
          className={`pointer-events-auto w-full max-w-md rounded-xl px-4 py-3 text-base font-semibold shadow-lg ${
            t.kind === "error" ? "bg-danger text-white" : "bg-ink text-white"
          }`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}

/** Run a state update; show any validation error as a toast instead of crashing. Returns true on success. */
export function act(update: (s: AppState) => AppState, success?: string): boolean {
  try {
    dispatch(update);
    if (success) toast(success);
    return true;
  } catch (e) {
    toast(e instanceof Error ? e.message : "Something went wrong", "error");
    return false;
  }
}

// ───────────────────────── primitives ─────────────────────────

type Variant = "primary" | "accent" | "ghost" | "danger" | "outline";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-primary text-primary-ink hover:opacity-95",
  accent: "bg-accent text-accent-ink hover:opacity-95",
  // no text color: inherits ink, and callers can pass text-danger etc. without a CSS-order fight
  ghost: "bg-transparent hover:bg-surface-2",
  danger: "bg-danger text-white",
  outline: "border-2 border-line bg-surface text-ink hover:bg-surface-2",
};

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "min-h-10 px-3 text-sm", md: "min-h-12 px-4 text-base", lg: "min-h-14 px-5 text-lg" };
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 ${VARIANTS[variant]} ${sizes[size]} ${className}`}
    />
  );
}

export function Card({ children, className = "", title, action }: { children: ReactNode; className?: string; title?: ReactNode; action?: ReactNode }) {
  return (
    <section className={`rounded-2xl border border-line bg-surface p-4 shadow-sm ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="text-lg font-bold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "ok" | "warn" | "danger" | "accent" }) {
  const tones = {
    neutral: "bg-surface-2 text-muted border-line",
    ok: "bg-ok-soft text-ok border-ok/30",
    warn: "bg-warn-soft text-warn border-warn/30",
    danger: "bg-danger-soft text-danger border-danger/30",
    accent: "bg-accent-soft text-ink border-accent/40",
  };
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-bold ${tones[tone]}`}>{children}</span>;
}

export function Banner({ tone = "warn", children }: { tone?: "warn" | "danger" | "info"; children: ReactNode }) {
  const tones = { warn: "bg-warn-soft text-warn border-warn/40", danger: "bg-danger-soft text-danger border-danger/40", info: "bg-surface-2 text-ink border-line" };
  return (
    <div role={tone === "danger" ? "alert" : "note"} className={`flex gap-2 rounded-xl border px-3 py-2 text-sm font-medium ${tones[tone]}`}>
      {tone !== "info" && <Icon name="warn" className="mt-0.5 h-5 w-5 shrink-0" />}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-bold text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "w-full min-h-12 rounded-xl border-2 border-line bg-surface px-3 text-base text-ink placeholder:text-muted/70 focus:border-primary focus:outline-none";

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>("input, select, textarea, button:not([data-close])");
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return onClose();
      if (e.key !== "Tab" || !ref.current) return;
      // keep keyboard focus inside the sheet
      const items = [...ref.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])')];
      if (!items.length) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; // stop the page behind from scrolling
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="safe-bottom max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-surface p-5 shadow-2xl sm:rounded-3xl"
      >
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 className="text-xl font-bold">{title}</h2>
          <button data-close type="button" onClick={onClose} className="rounded-full p-2 hover:bg-surface-2" aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border-2 border-dashed border-line px-4 py-6 text-center text-muted">{children}</p>;
}

/** Render children only after mount (data lives in browser storage). */
export function Hydrated({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready)
    return (
      <div className="flex min-h-[50dvh] items-center justify-center text-muted" role="status">
        Loading your notebook…
      </div>
    );
  return <>{children}</>;
}

export function downloadFile(name: string, content: string, type = "application/json") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function csv(rows: (string | number)[][]): string {
  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
}
