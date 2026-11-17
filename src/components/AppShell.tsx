"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { consumeLoadWarning, dispatch, useSaveStatus } from "@/lib/state/store";
import { setActiveWorkspace } from "@/lib/state/ops";
import { WORKSPACES, type WorkspaceId } from "@/lib/workspaces";
import { ConverterSheet } from "./Converter";
import { ProfileSheet } from "./ProfileSheet";
import { useProfile } from "./useProfile";
import { Icon } from "./Icon";
import { Banner, Hydrated, Toasts } from "./ui";

function SaveIndicator() {
  const status = useSaveStatus();
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  if (status.kind === "error")
    return (
      <span role="alert" className="rounded-full bg-danger px-2 py-1 text-xs font-bold text-white">
        Not saved!
      </span>
    );
  return (
    <span className="block truncate text-xs font-semibold text-primary-ink/80" role="status" aria-live="polite">
      {status.kind === "saved" ? "✓ Saved" : "Demo · this device"}
      {!online && " · offline"}
    </span>
  );
}

export function AppShell({ ws, children }: { ws: WorkspaceId; children: ReactNode }) {
  const cfg = WORKSPACES[ws];
  const pathname = usePathname();
  const [warning, setWarning] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  const [profilesOpen, setProfilesOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const profile = useProfile(ws);
  const nav = mounted ? cfg.nav.filter((n, i) => i === 0 || !profile.hiddenTabs.includes(n.href) || pathname.startsWith(n.href)) : cfg.nav;

  useEffect(() => {
    dispatch((s) => setActiveWorkspace(s, ws));
    setWarning(consumeLoadWarning());
  }, [ws]);

  useEffect(() => {
    const color = getComputedStyle(document.querySelector(`[data-ws="${ws}"]`) ?? document.body).getPropertyValue("--primary").trim();
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color || "#1b2a4a");
  }, [ws]);

  const isActive = (href: string) => (href === cfg.base ? pathname === href : pathname.startsWith(href));

  return (
    <div data-ws={ws} className="min-h-dvh bg-bg text-ink">
      <Toasts />
      <header className="no-print sticky top-0 z-40 bg-primary text-primary-ink shadow">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-2" style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}>
          <div className="h-8 w-1.5 rounded-full bg-accent" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-extrabold leading-tight">{cfg.name}</p>
            <button
              type="button"
              onClick={() => setProfilesOpen(true)}
              className="flex max-w-full items-center gap-1 text-left"
              aria-label={mounted ? `Profile: ${profile.name}. Change profile` : "Profiles"}
            >
              {mounted && (
                <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-accent-ink">👤 {profile.name} ▾</span>
              )}
              <SaveIndicator />
            </button>
          </div>
          <button
            type="button"
            onClick={() => setConverting(true)}
            className="flex min-h-11 min-w-11 flex-col items-center justify-center rounded-xl border border-primary-ink/30 px-2 text-[10px] font-semibold leading-none hover:bg-white/10 sm:flex-row sm:gap-1 sm:px-3 sm:text-sm"
            aria-label="Measurement converter"
          >
            <Icon name="scale" className="h-5 w-5" />
            <span className="mt-0.5 sm:mt-0">Convert</span>
          </button>
          <Link
            href="/"
            className="flex min-h-11 min-w-11 flex-col items-center justify-center rounded-xl border border-primary-ink/30 px-2 text-[10px] font-semibold leading-none hover:bg-white/10 sm:flex-row sm:gap-1 sm:px-3 sm:text-sm"
            aria-label="Switch workspace"
          >
            <Icon name="swap" className="h-5 w-5" />
            <span className="mt-0.5 sm:mt-0">Switch</span>
          </Link>
        </div>
      </header>

      <main className="print-full mx-auto max-w-3xl px-4 pb-28 pt-4">
        <Hydrated>
          <ConverterSheet open={converting} onClose={() => setConverting(false)} />
          <ProfileSheet ws={ws} open={profilesOpen} onClose={() => setProfilesOpen(false)} />
          {warning && (
            <div className="mb-3">
              <Banner tone="danger">{warning}</Banner>
            </div>
          )}
          {children}
        </Hydrated>
      </main>

      <nav aria-label={`${cfg.name} navigation`} className="no-print safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
        <ul className="mx-auto flex max-w-3xl">
          {nav.map((item) => {
            const active = isActive(item.href);
            return (
              <li key={item.href} className="flex-1">
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-bold ${active ? "text-primary" : "text-muted"}`}
                >
                  <span className={`rounded-full px-3 py-1 ${active ? "bg-accent-soft" : ""}`}>
                    <Icon name={item.icon} className="h-6 w-6" />
                  </span>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
