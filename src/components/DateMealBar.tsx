"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { addDays, formatMedium, isISODate, localToday, type ISODate } from "@/lib/dates";
import { MEAL_LABELS, MEAL_SERVICES, type MealService } from "@/lib/menu/types";
import { Icon } from "./Icon";

export function defaultMeal(now = new Date()): MealService {
  const h = now.getHours();
  return h < 10 ? "breakfast" : h < 15 ? "lunch" : "dinner";
}

/** Selected date & meal live in the URL (no resident data), so back/forward and reloads keep your place. */
export function useDateMeal(preferred: MealService | "auto" = "auto") {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const rawDate = params.get("date") ?? "";
  const rawMeal = params.get("meal") ?? "";
  const date: ISODate = isISODate(rawDate) ? rawDate : localToday();
  const meal: MealService = (MEAL_SERVICES as readonly string[]).includes(rawMeal) ? (rawMeal as MealService) : preferred === "auto" ? defaultMeal() : preferred;
  const set = useCallback(
    (next: { date?: ISODate; meal?: MealService }) => {
      const q = new URLSearchParams(params.toString());
      q.set("date", next.date ?? date);
      q.set("meal", next.meal ?? meal);
      router.replace(`${pathname}?${q.toString()}`, { scroll: false });
    },
    [params, router, pathname, date, meal],
  );
  return { date, meal, set };
}

export function DateBar({ date, onChange, subtitle }: { date: ISODate; onChange: (d: ISODate) => void; subtitle?: string }) {
  const today = localToday();
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => onChange(addDays(date, -1))} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 border-line bg-surface" aria-label="Previous day">
        <Icon name="chevL" />
      </button>
      <label className="relative min-w-0 flex-1 rounded-xl border-2 border-line bg-surface px-3 py-1.5 text-center">
        <span className="block truncate text-base font-extrabold">{formatMedium(date)}</span>
        <span className="block truncate text-xs font-semibold text-muted">{date === today ? "Today" : subtitle ?? "Tap to pick a date"}{date === today && subtitle ? ` · ${subtitle}` : ""}</span>
        <input
          type="date"
          aria-label="Pick a date"
          value={date}
          onChange={(e) => isISODate(e.target.value) && onChange(e.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>
      <button type="button" onClick={() => onChange(addDays(date, 1))} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 border-line bg-surface" aria-label="Next day">
        <Icon name="chevR" />
      </button>
      {date !== today && (
        <button type="button" onClick={() => onChange(today)} className="h-12 shrink-0 rounded-xl bg-accent-soft px-3 text-sm font-bold">
          Today
        </button>
      )}
    </div>
  );
}

/**
 * Meal tabs. `meals` = the meals this profile works; the others are tucked
 * behind "Other meals" so a night cook can still reach lunch in one tap.
 */
export function MealTabs({ meal, onChange, meals = [...MEAL_SERVICES] }: { meal: MealService; onChange: (m: MealService) => void; meals?: MealService[] }) {
  const [expanded, setExpanded] = useState(false);
  const showAll = expanded || meals.length === MEAL_SERVICES.length || !meals.includes(meal);
  const shown = showAll ? [...MEAL_SERVICES] : MEAL_SERVICES.filter((m) => meals.includes(m));
  const hiddenCount = MEAL_SERVICES.length - meals.length;
  return (
    <div className="flex items-stretch gap-2">
    <div role="tablist" aria-label="Meal service" className="grid flex-1 gap-1 rounded-xl bg-surface-2 p-1" style={{ gridTemplateColumns: `repeat(${shown.length}, minmax(0, 1fr))` }}>
      {shown.map((m) => (
        <button
          key={m}
          type="button"
          role="tab"
          aria-selected={m === meal}
          onClick={() => onChange(m)}
          className={`min-h-11 rounded-lg text-base font-bold ${m === meal ? "bg-primary text-primary-ink shadow" : "text-muted"}`}
        >
          {MEAL_LABELS[m]}
        </button>
      ))}
    </div>
    {hiddenCount > 0 && (
      <button
        type="button"
        onClick={() => {
          if (showAll && !meals.includes(meal)) onChange(meals[0]!);
          setExpanded(!showAll);
        }}
        className="shrink-0 rounded-xl border-2 border-line px-3 text-sm font-semibold text-muted"
        aria-expanded={showAll}
      >
        {showAll ? "My meals" : "Other meals"}
      </button>
    )}
    </div>
  );
}
