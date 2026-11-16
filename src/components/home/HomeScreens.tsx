"use client";
import { useMemo } from "react";
import { addDays, dayOfWeek, formatShort, type ISODate } from "@/lib/dates";
import { MEAL_LABELS, MEAL_SERVICES } from "@/lib/menu/types";
import * as ops from "@/lib/state/ops";
import { useAppState } from "@/lib/state/store";
import { DateBar, useDateMeal } from "../DateMealBar";
import { AuditLog, BackupPanel, InventoryList, ShoppingList } from "../Inventory";
import { PrepBoard } from "../PrepBoard";
import { act, Button, Card, inputCls } from "../ui";

export function MealPlanScreen() {
  const { date, set } = useDateMeal();
  const d = useAppState((s) => s.workspaces.home);
  const weekStart = useMemo(() => addDays(date, -dayOfWeek(date)), [date]);
  const days: ISODate[] = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  return (
    <div className="space-y-3">
      <DateBar date={date} onChange={(x) => set({ date: x })} subtitle={`Week of ${formatShort(weekStart)}`} />
      <Card
        title="This week"
        action={
          <Button size="sm" variant="outline" onClick={() => act((s) => ops.groceryFromPlan(s, days), "Ingredients added to shopping list")}>
            → Groceries
          </Button>
        }
      >
        <datalist id="home-recipes">
          {d.recipes.map((r) => (
            <option key={r.id} value={r.name} />
          ))}
        </datalist>
        <ul className="space-y-3">
          {days.map((day) => (
            <li key={day} className="rounded-xl border border-line p-3">
              <p className="mb-2 font-extrabold">{formatShort(day)}</p>
              <div className="space-y-2">
                {MEAL_SERVICES.map((m) => (
                  <label key={m} className="flex items-center gap-2">
                    <span className="w-20 shrink-0 text-sm font-semibold text-muted">{MEAL_LABELS[m]}</span>
                    <input
                      className={inputCls}
                      list="home-recipes"
                      defaultValue={d.mealPlan[day]?.[m] ?? ""}
                      key={`${day}-${m}-${d.mealPlan[day]?.[m] ?? ""}`}
                      onBlur={(e) => e.target.value !== (d.mealPlan[day]?.[m] ?? "") && act((s) => ops.setMealPlan(s, day, m, e.target.value))}
                      placeholder="—"
                      aria-label={`${formatShort(day)} ${MEAL_LABELS[m]}`}
                    />
                  </label>
                ))}
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">Pick a saved recipe name to pull its ingredients into the grocery list. Items already in the pantry are skipped.</p>
      </Card>
      <Card title="Cooking checklist">
        <PrepBoard ws="home" baseDate={date} withMeals />
      </Card>
    </div>
  );
}

export function HomeShopping() {
  return <ShoppingList ws="home" title="Grocery list" />;
}

export function HomePantry() {
  return (
    <div className="space-y-3">
      <InventoryList ws="home" title="Pantry" />
      <BackupPanel ws="home" />
      <AuditLog ws="home" />
    </div>
  );
}
