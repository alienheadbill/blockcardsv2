"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getState } from "@/lib/state/store";
import { WORKSPACE_IDS, WORKSPACES, type WorkspaceId } from "@/lib/workspaces";

export function WorkspacePicker() {
  const [last, setLast] = useState<WorkspaceId | null>(null);
  useEffect(() => setLast(getState().activeWorkspace), []);
  return (
    <main className="mx-auto max-w-xl px-4 py-8" data-ws="stann" style={{ paddingTop: "max(2rem, env(safe-area-inset-top))" }}>
      <h1 className="text-3xl font-extrabold tracking-tight text-[#1b2a4a]">Kitchen Blockcards</h1>
      <p className="mt-1 text-base text-[#4a5568]">Your kitchen notebook — counts, prep, menus and recipes. Pick a workspace:</p>
      <ul className="mt-6 space-y-4">
        {WORKSPACE_IDS.map((id) => {
          const ws = WORKSPACES[id];
          return (
            <li key={id} data-ws={id}>
              <Link
                href={ws.base}
                className="flex items-center gap-4 rounded-2xl border-2 border-line bg-surface p-4 shadow-sm transition active:scale-[0.99]"
              >
                <span className="flex h-14 w-14 shrink-0 flex-col overflow-hidden rounded-xl border border-line" aria-hidden>
                  <span className="flex-[2] bg-primary" />
                  <span className="flex-1 bg-accent" />
                  <span className="flex-1 bg-bg" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xl font-extrabold text-ink">{ws.name}</span>
                  <span className="block text-sm text-muted">{ws.tagline}</span>
                  {last === id && <span className="mt-1 inline-block rounded-full bg-accent-soft px-2 py-0.5 text-xs font-bold text-ink">Last used</span>}
                </span>
                <span className="text-2xl text-muted" aria-hidden>
                  ›
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mt-8 rounded-xl border border-[#cfd6e3] bg-white p-3 text-sm text-[#4a5568]">
        <strong className="text-[#0d1626]">Demo mode.</strong> Data stays on this device and uses fictional room numbers only. Do not enter real resident
        names or health information. Facility mode requires an approved, secured server deployment.
      </p>
    </main>
  );
}
