"use client";
import Link from "next/link";
import { useMemo } from "react";
import * as C from "@/lib/counting";
import { addDays, formatLong, formatShort, localToday, type ISODate } from "@/lib/dates";
import { MEAL_LABELS, MEAL_SERVICES, isEntree, type MealService } from "@/lib/menu/types";
import * as P from "@/lib/prep";
import { needsAttention } from "@/lib/requests";
import type { AppState } from "@/lib/state/model";
import * as ops from "@/lib/state/ops";
import { useAppState } from "@/lib/state/store";
import { positionLabel } from "../MenuList";
import { useProfile } from "../useProfile";
import { Badge, Banner, Card } from "../ui";

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

function nextService(servingTimes: Record<MealService, string>, meals: readonly MealService[], now = new Date()): MealService | null {
  const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return meals.find((m) => servingTimes[m] >= hhmm) ?? null;
}

export function TodayDashboard() {
  const state = useAppState((s) => s);
  const d = state.workspaces.stann;
  const today = localToday();
  const profile = useProfile("stann");
  const meals = profile.meals;
  const upcoming = nextService(d.settings.servingTimes, meals);
  const suggestions = useMemo(() => menuSuggestions(state, today, 3, meals), [state, today, meals]);
  const pendingSugg = useMemo(() => P.pendingSuggestions(suggestions, d.prep, d.dismissedSuggestions), [suggestions, d.prep, d.dismissedSuggestions]);

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
            Rotation start date ({formatShort(d.rotation.week1Start)} = Week 1 Sunday) is <strong>not yet confirmed</strong> with the facility.{" "}
            <Link href="/stann/menu#rotation" className="font-bold underline">
              Review
            </Link>
          </Banner>
        )
      )}

      <DayCard mealList={meals} state={state} date={today} label="Today" upcoming={upcoming} highlight />
      <DayCard mealList={meals} state={state} date={addDays(today, 1)} label="Tomorrow" aheadSuggestions={pendingSugg.filter((s) => s.date === today && s.key.endsWith("|thaw"))} />
      <DayCard mealList={meals} state={state} date={addDays(today, 2)} label="Two Days Ahead" />
    </div>
  );
}

function DayCard({
  state,
  date,
  label,
  upcoming,
  highlight,
  aheadSuggestions,
  mealList,
}: {
  mealList: readonly MealService[];
  state: AppState;
  date: ISODate;
  label: string;
  upcoming?: MealService | null;
  highlight?: boolean;
  aheadSuggestions?: P.PrepSuggestion[];
}) {
  const d = state.workspaces.stann;
  const meals = mealList.map((m) => ({ meal: m, r: ops.mealFor(state, date, m), session: d.counts[C.sessionKey(date, m)] }));
  const prep = d.prep.filter((t) => t.date === date && (!t.meal || mealList.includes(t.meal)));
  const prog = P.progress(prep);
  const reqs = d.requests.filter((r) => r.date === date && r.status !== "cancelled" && mealList.includes(r.meal));
  const attention = reqs.filter(needsAttention);
  const pos = meals[0]!.r;

  return (
    <section className={`rounded-2xl border bg-surface shadow-sm ${highlight ? "border-2 border-primary" : "border-line"}`} aria-label={label}>
      <header className={`flex items-center justify-between gap-2 rounded-t-2xl px-4 py-2 ${highlight ? "bg-primary text-primary-ink" : "bg-surface-2"}`}>
        <div>
          <h2 className="text-lg font-extrabold">{label}</h2>
          <p className="text-sm font-semibold opacity-90">{formatLong(date)}</p>
        </div>
        <span className={`shrink-0 whitespace-nowrap rounded-lg px-2 py-1 text-sm font-bold ${highlight ? "bg-accent text-accent-ink" : "bg-accent-soft"}`}>{positionLabel(pos)}</span>
      </header>
      <div className="space-y-3 p-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <Link href={`/stann/prep`} className="rounded-xl bg-surface-2 p-2">
            <div className="text-2xl font-extrabold tabular-nums">
              {prog.done}/{prog.total}
            </div>
            <div className="text-xs font-semibold text-muted">prep done</div>
          </Link>
          <Link href={`/stann/counts?date=${date}&meal=${upcoming ?? "dinner"}`} className={`rounded-xl p-2 ${attention.length ? "bg-warn-soft text-warn" : "bg-surface-2"}`}>
            <div className="text-2xl font-extrabold tabular-nums">{reqs.length}</div>
            <div className="text-xs font-semibold">{attention.length ? `${attention.length} need attention` : "requests"}</div>
          </Link>
          <div className="rounded-xl bg-surface-2 p-2">
            <div className="text-2xl font-extrabold tabular-nums">{meals.filter((m) => m.session?.status === "complete").length}/{meals.length}</div>
            <div className="text-xs font-semibold text-muted">counts done</div>
          </div>
        </div>

        <ul className="space-y-2">
          {meals.map(({ meal, r, session }) => {
            const entrees = r.items.filter(isEntree);
            const others = r.items.filter((i) => !isEntree(i));
            const sum = session ? C.summarize(session) : null;
            const isNext = upcoming === meal && highlight;
            return (
              <li key={meal}>
                <Link
                  href={`/stann/counts?date=${date}&meal=${meal}`}
                  className={`block rounded-xl border p-3 active:bg-surface-2 ${isNext ? "border-2 border-accent bg-accent-soft/40" : "border-line"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-base font-extrabold">
                      {MEAL_LABELS[meal]}
                      <span className="ml-2 text-sm font-semibold text-muted">{d.settings.servingTimes[meal]}</span>
                    </span>
                    <span className="flex gap-1">
                      {isNext && <Badge tone="accent">Up next</Badge>}
                      {r.source === "override" && <Badge tone="warn">Changed</Badge>}
                      {sum ? (
                        <Badge tone={session!.status === "complete" ? "ok" : "accent"}>
                          {sum.totalMeals} counted{session!.status === "complete" ? " ✓" : ""}
                        </Badge>
                      ) : null}
                    </span>
                  </div>
                  {entrees.length ? (
                    <div className="mt-1 space-y-0.5">
                      {entrees.map((e) => (
                        <p key={e.id} className="text-base leading-snug">
                          <span className="font-bold text-muted">{e.kind === "alt" ? "A: " : ""}</span>
                          <span className="font-semibold">{e.text}</span>
                          {sum && <span className="ml-1 font-extrabold tabular-nums">· {sum.byChoice[e.id] ?? 0}</span>}
                        </p>
                      ))}
                      {others.length > 0 && <p className="text-sm text-muted">{others.map((o) => (o.printedLabel ? `${o.printedLabel}: ${o.text}` : o.text)).join(" · ")}</p>}
                    </div>
                  ) : (
                    <p className="mt-1 text-sm text-muted">No menu — rotation not set.</p>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>

        {aheadSuggestions && aheadSuggestions.length > 0 && (
          <div className="rounded-xl border border-dashed border-line p-3">
            <p className="text-sm font-bold">Pull / thaw today for tomorrow:</p>
            <ul className="mt-1 list-disc pl-5 text-sm">
              {aheadSuggestions.map((s) => (
                <li key={s.key}>{s.title.replace("Pull to thaw: ", "")}</li>
              ))}
            </ul>
            <Link href="/stann/prep" className="mt-1 inline-block text-sm font-bold text-primary underline">
              Add to prep list
            </Link>
          </div>
        )}
        {prep.filter((t) => !t.done).length > 0 && (
          <div>
            <p className="text-sm font-bold text-muted">Open prep</p>
            <ul className="mt-1 flex flex-wrap gap-1">
              {P.sortTasks(prep)
                .filter((t) => !t.done)
                .slice(0, 8)
                .map((t) => (
                  <li key={t.id} className="rounded-lg bg-surface-2 px-2 py-1 text-sm">
                    {t.startTime && <strong>{t.startTime} </strong>}
                    {t.title}
                  </li>
                ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
