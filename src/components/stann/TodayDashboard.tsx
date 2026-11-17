"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { addDays, formatLong, formatShort, localToday, type ISODate } from "@/lib/dates";
import { MEAL_LABELS, MEAL_SERVICES, isEntree, type MealService } from "@/lib/menu/types";
import * as P from "@/lib/prep";
import type { AppState } from "@/lib/state/model";
import * as ops from "@/lib/state/ops";
import { useAppState } from "@/lib/state/store";
import { positionLabel } from "../MenuList";
import { useProfile } from "../useProfile";
import { Banner } from "../ui";
import { useServiceSteps, type StepInfo } from "./ServiceFlow";

/** Suggestions for [from, from+span) including day-ahead pulls for the day after. */
export function menuSuggestions(state: AppState, from: ISODate, span = 3, meals: readonly MealService[] = MEAL_SERVICES): P.PrepSuggestion[] {
  const out: P.PrepSuggestion[] = [];
  const last = addDays(from, span - 1);
  for (let i = 0; i <= span; i++) {
    const d = addDays(from, i);
    for (const m of meals) {
      const r = ops.mealFor(state, d, m);
      for (const s of P.suggestForMeal(d, m, r.items)) if (s.date >= from && s.date <= last) out.push(s);
    }
  }
  return out;
}

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** The service to focus on: the next one still to be served, or the last one once they're all past. */
export function focusService(servingTimes: Record<MealService, string>, meals: readonly MealService[], now = new Date()): MealService {
  const t = now.getHours() * 60 + now.getMinutes();
  // keep a service in focus until an hour after it's served
  return meals.find((m) => minutes(servingTimes[m]) + 60 >= t) ?? meals[meals.length - 1] ?? "dinner";
}

function timeText(hhmm: string, now: Date) {
  const diff = minutes(hhmm) - (now.getHours() * 60 + now.getMinutes());
  const [h, m] = hhmm.split(":").map(Number);
  const clock = new Date(2000, 0, 1, h, m).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (diff > 0) return `serves ${clock} · in ${diff >= 60 ? `${Math.floor(diff / 60)} h ` : ""}${diff % 60} min`;
  if (diff > -60) return `served at ${clock} · ${-diff} min ago`;
  return `served at ${clock}`;
}

export function TodayDashboard() {
  const state = useAppState((s) => s);
  const d = state.workspaces.stann;
  const today = localToday();
  const profile = useProfile("stann");
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  const auto = focusService(d.settings.servingTimes, profile.meals, now);
  const [picked, setPicked] = useState<MealService | null>(null);
  const meal = picked && profile.meals.includes(picked) ? picked : auto;

  return (
    <div className="space-y-4">
      {!d.rotation.week1Start ? (
        <Banner>
          Menu rotation isn&apos;t set up.{" "}
          <Link href="/stann/menu#rotation" className="font-bold underline">
            Set the Week 1 start date
          </Link>
        </Banner>
      ) : (
        !d.rotation.confirmed && (
          <Banner>
            Rotation start date ({formatShort(d.rotation.week1Start)} = Week 1 Sunday) is <strong>not yet confirmed</strong>.{" "}
            <Link href="/stann/menu#rotation" className="font-bold underline">
              Review
            </Link>
          </Banner>
        )
      )}

      {profile.meals.length > 1 && (
        <div role="tablist" aria-label="Service" className="grid gap-1 rounded-xl bg-surface-2 p-1" style={{ gridTemplateColumns: `repeat(${profile.meals.length}, minmax(0,1fr))` }}>
          {profile.meals.map((m) => (
            <button key={m} type="button" role="tab" aria-selected={m === meal} onClick={() => setPicked(m)} className={`min-h-11 rounded-lg font-bold ${m === meal ? "bg-primary text-primary-ink" : "text-muted"}`}>
              {MEAL_LABELS[m]}
            </button>
          ))}
        </div>
      )}

      <ServiceCommand state={state} date={today} meal={meal} now={now} />

      <Ahead state={state} from={addDays(today, 1)} meals={profile.meals} />
    </div>
  );
}

const MARK: Record<StepInfo["tone"], { sym: string; cls: string; text: string }> = {
  done: { sym: "✓", cls: "bg-ok text-white", text: "Done" },
  attention: { sym: "!", cls: "bg-warn text-white", text: "Needs attention" },
  todo: { sym: "", cls: "border-2 border-ink/40 text-transparent", text: "To do" },
};

function ServiceCommand({ state, date, meal, now }: { state: AppState; date: ISODate; meal: MealService; now: Date }) {
  const d = state.workspaces.stann;
  const { steps, status } = useServiceSteps(date, meal);
  const entrees = status.menu.items.filter(isEntree);
  const others = status.menu.items.filter((i) => !isEntree(i));
  const q = `?date=${date}&meal=${meal}`;

  const detail: Record<StepInfo["id"], React.ReactNode> = {
    count: status.count ? (
      <>
        {status.count.total} meals {status.count.status === "complete" ? "· complete" : "· still counting"}
      </>
    ) : (
      "Start when the slips come in"
    ),
    production: status.production ? (
      <ul className="space-y-0.5">
        {status.production.results
          .filter((r) => r.res.servings > 0)
          .slice(0, 4)
          .map(({ line, res }) => (
            <li key={line.id}>
              <strong>{res.servings}</strong> {line.label}
              {res.makeAmount ? ` → ${res.makeAmount.kitchen}` : ""}
              {res.textures.length > 0 && <span className="text-xs"> ({res.textures.map((t) => `${t.count} ${t.label.replace(/ \(L\d\)/, "")}`).join(", ")})</span>}
            </li>
          ))}
      </ul>
    ) : status.count ? (
      "Work out how much to make from the count"
    ) : (
      "After the count"
    ),
    prep: status.prep.total ? (
      <>
        {status.prep.done} of {status.prep.total} done
        {(() => {
          const open = P.sortTasks(d.prep.filter((t) => t.date === date && (t.meal === meal || !t.meal) && !t.done)).slice(0, 2);
          return open.length ? <span className="block truncate">Next: {open.map((t) => t.title).join(" · ")}</span> : null;
        })()}
      </>
    ) : (
      "No prep tasks yet"
    ),
    ready: (
      <>
        Checklist {status.ready.done}/{status.ready.total} · {status.temps.logged} temp{status.temps.logged === 1 ? "" : "s"} logged
        {status.temps.outOfRange > 0 && <strong className="block">{status.temps.outOfRange} reading(s) outside your limits need an action</strong>}
      </>
    ),
  };

  const attention: { text: string; href: string }[] = [];
  if (status.count && status.count.unresolved) attention.push({ text: `${status.count.unresolved} unclear slip(s) to sort out`, href: `/stann/counts${q}` });
  if (status.requests.flagged) attention.push({ text: `${status.requests.flagged} request(s) flagged for staff review`, href: `/stann/counts${q}` });
  if (status.requests.unchecked) attention.push({ text: `${status.requests.unchecked} request(s) not diet-checked yet`, href: `/stann/counts${q}` });
  if (status.production?.needsPortion) attention.push({ text: `${status.production.needsPortion} production item(s) need a portion size`, href: `/stann/production${q}` });
  if (status.temps.outOfRange) attention.push({ text: `${status.temps.outOfRange} temperature reading(s) outside your limits`, href: `/stann/ready${q}` });
  const overdue = d.prep.filter((t) => !t.done && t.date < date && (!t.meal || t.meal === meal));
  if (overdue.length) attention.push({ text: `${overdue.length} prep task(s) from earlier days not done`, href: `/stann/prep${q}` });

  return (
    <section aria-label={`${MEAL_LABELS[meal]} service`} className="overflow-hidden rounded-2xl border-2 border-primary bg-surface shadow-sm">
      <header className="bg-primary px-4 py-3 text-primary-ink">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xl font-extrabold">{MEAL_LABELS[meal]}</h2>
          <span className="shrink-0 whitespace-nowrap rounded-lg bg-accent px-2 py-1 text-sm font-bold text-accent-ink">{positionLabel(status.menu)}</span>
        </div>
        <p className="text-sm font-semibold opacity-90">
          {formatLong(date)} · {timeText(d.settings.servingTimes[meal], now)}
        </p>
      </header>

      <div className="space-y-3 p-4">
        <Link href={`/stann/menu${q}`} className="block rounded-xl bg-surface-2 p-3">
          {entrees.length ? (
            <>
              {entrees.map((e) => (
                <p key={e.id} className="text-base leading-snug">
                  <span className="font-bold text-muted">{e.kind === "alt" ? "A: " : ""}</span>
                  <span className="font-semibold">{e.text}</span>
                </p>
              ))}
              {others.length > 0 && <p className="text-sm text-muted">{others.map((o) => (o.printedLabel ? `${o.printedLabel}: ${o.text}` : o.text)).join(" · ")}</p>}
              {status.menu.source === "override" && <p className="text-sm font-semibold text-warn">Changed for today: {status.menu.overrideReason}</p>}
            </>
          ) : (
            <p className="text-sm text-muted">No printed menu — you can still count with your own boxes.</p>
          )}
        </Link>

        <ol className="space-y-2" aria-label="Steps">
          {steps.map((s, i) => (
            <li key={s.id}>
              <Link href={s.href} className="flex items-start gap-3 rounded-xl border-2 border-line p-3 active:bg-surface-2" aria-label={`${s.label}: ${MARK[s.tone].text}`}>
                <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-lg font-black ${MARK[s.tone].cls}`} aria-hidden>
                  {MARK[s.tone].sym || i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-base font-extrabold">{s.label}</span>
                    <span className={`text-xs font-bold ${s.tone === "attention" ? "text-warn" : s.tone === "done" ? "text-ok" : "text-muted"}`}>{MARK[s.tone].text}</span>
                  </span>
                  <span className="block text-sm text-muted">{detail[s.id]}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>

        <div>
          <h3 className="mb-1 text-sm font-bold">Needs attention</h3>
          {attention.length === 0 ? (
            <p className="rounded-xl bg-ok-soft px-3 py-2 text-sm font-semibold text-ok">✓ Nothing needs attention right now</p>
          ) : (
            <ul className="space-y-1">
              {attention.map((a) => (
                <li key={a.text}>
                  <Link href={a.href} className="flex min-h-11 items-center gap-2 rounded-xl bg-warn-soft px-3 text-sm font-semibold text-warn">
                    <span aria-hidden>⚠</span> {a.text} <span className="ml-auto" aria-hidden>›</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

/** Tomorrow and the day after: what's coming, and what to pull or start today. */
function Ahead({ state, from, meals }: { state: AppState; from: ISODate; meals: readonly MealService[] }) {
  const d = state.workspaces.stann;
  const today = addDays(from, -1);
  const pulls = useMemo(
    () => P.pendingSuggestions(menuSuggestions(state, today, 2, meals), d.prep, d.dismissedSuggestions).filter((s) => s.date === today && /\|(thaw|ahead)$/.test(s.key)),
    [state, today, meals, d.prep, d.dismissedSuggestions],
  );
  return (
    <section aria-label="Coming up" className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
      <h2 className="mb-2 text-lg font-bold">Coming up</h2>
      {pulls.length > 0 && (
        <div className="mb-3 rounded-xl border border-dashed border-line p-3">
          <p className="text-sm font-bold">Pull or start today for tomorrow</p>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {pulls.map((s) => (
              <li key={s.key}>{s.title.replace("Pull to thaw: ", "Thaw ")}</li>
            ))}
          </ul>
          <Link href="/stann/prep" className="mt-1 inline-block text-sm font-bold text-primary underline">
            Add to prep list
          </Link>
        </div>
      )}
      <ul className="space-y-3">
        {[0, 1].map((i) => {
          const date = addDays(from, i);
          const first = ops.mealFor(state, date, meals[0] ?? "dinner");
          return (
            <li key={date}>
              <p className="text-sm font-bold">
                {i === 0 ? "Tomorrow" : formatShort(date)} <span className="font-semibold text-muted">· {positionLabel(first)}</span>
              </p>
              {meals.map((m) => {
                const r = ops.mealFor(state, date, m);
                const e = r.items.filter(isEntree);
                return (
                  <p key={m} className="text-sm">
                    {meals.length > 1 && <span className="font-semibold text-muted">{MEAL_LABELS[m]}: </span>}
                    {e.length ? e.map((x) => x.text).join(" / ") : "—"}
                  </p>
                );
              })}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

