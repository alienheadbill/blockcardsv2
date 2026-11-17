"use client";
import Link from "next/link";
import { useMemo } from "react";
import type { ISODate } from "@/lib/dates";
import type { MealService } from "@/lib/menu/types";
import * as ops from "@/lib/state/ops";
import { useAppState } from "@/lib/state/store";

export type FlowStep = "count" | "production" | "prep" | "ready";

type Tone = "done" | "attention" | "todo";

export interface StepInfo {
  id: FlowStep;
  label: string;
  href: string;
  status: string;
  tone: Tone;
}

/** Status of each stage of one service: Count → Production → Prep → Ready. */
export function useServiceSteps(date: ISODate, meal: MealService): { steps: StepInfo[]; status: ReturnType<typeof ops.serviceStatus> } {
  const state = useAppState((s) => s);
  return useMemo(() => {
    const st = ops.serviceStatus(state, date, meal);
    const q = `?date=${date}&meal=${meal}`;
    const count: StepInfo = !st.count
      ? { id: "count", label: "Count", href: `/stann/counts${q}`, status: "Not started", tone: "todo" }
      : st.count.unresolved > 0
        ? { id: "count", label: "Count", href: `/stann/counts${q}`, status: `${st.count.unresolved} unclear`, tone: "attention" }
        : st.count.status === "complete"
          ? { id: "count", label: "Count", href: `/stann/counts${q}`, status: `${st.count.total} done`, tone: "done" }
          : { id: "count", label: "Count", href: `/stann/counts${q}`, status: `${st.count.total} so far`, tone: "todo" };
    const production: StepInfo = !st.production
      ? { id: "production", label: "Production", href: `/stann/production${q}`, status: st.count ? "Not set up" : "After count", tone: "todo" }
      : st.production.needsPortion > 0
        ? { id: "production", label: "Production", href: `/stann/production${q}`, status: `${st.production.needsPortion} need size`, tone: "attention" }
        : { id: "production", label: "Production", href: `/stann/production${q}`, status: `${st.production.lines} items`, tone: "done" };
    const prep: StepInfo = {
      id: "prep",
      label: "Prep",
      href: `/stann/prep${q}`,
      status: st.prep.total ? `${st.prep.done}/${st.prep.total}` : "No tasks",
      tone: st.prep.total && st.prep.done === st.prep.total ? "done" : "todo",
    };
    const ready: StepInfo = {
      id: "ready",
      label: "Ready",
      href: `/stann/ready${q}`,
      status: st.temps.outOfRange ? `${st.temps.outOfRange} temp alert` : `${st.ready.done}/${st.ready.total}`,
      tone: st.temps.outOfRange ? "attention" : st.ready.total && st.ready.done === st.ready.total ? "done" : "todo",
    };
    return { steps: [count, production, prep, ready], status: st };
  }, [state, date, meal]);
}

const TONE_CLS: Record<Tone, string> = {
  done: "border-ok/50 bg-ok-soft text-ok",
  attention: "border-warn/60 bg-warn-soft text-warn",
  todo: "border-line bg-surface text-muted",
};
const TONE_MARK: Record<Tone, string> = { done: "✓", attention: "!", todo: "○" };
const TONE_TEXT: Record<Tone, string> = { done: "done", attention: "needs attention", todo: "to do" };

/** Compact step bar shown on top of Count, Production, Prep and Ready. */
export function ServiceFlow({ date, meal, current }: { date: ISODate; meal: MealService; current: FlowStep }) {
  const { steps } = useServiceSteps(date, meal);
  return (
    <nav aria-label="Service steps" className="no-print">
      <ol className="grid grid-cols-4 gap-1">
        {steps.map((s, i) => (
          <li key={s.id}>
            <Link
              href={s.href}
              aria-current={s.id === current ? "step" : undefined}
              aria-label={`Step ${i + 1}, ${s.label}: ${s.status} (${TONE_TEXT[s.tone]})`}
              className={`flex min-h-14 flex-col items-center justify-center rounded-xl border-2 px-1 text-center leading-tight ${TONE_CLS[s.tone]} ${s.id === current ? "ring-2 ring-primary ring-offset-1" : ""}`}
            >
              <span className="text-xs font-extrabold text-ink">
                <span aria-hidden>{TONE_MARK[s.tone]} </span>
                {s.label}
              </span>
              <span className="text-[11px] font-semibold">{s.status}</span>
            </Link>
          </li>
        ))}
      </ol>
    </nav>
  );
}
