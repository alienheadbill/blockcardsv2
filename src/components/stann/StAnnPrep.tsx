"use client";
import { useMemo } from "react";
import { useAppState } from "@/lib/state/store";
import { DateBar, useDateMeal } from "../DateMealBar";
import { PrepBoard } from "../PrepBoard";
import { menuSuggestions } from "./TodayDashboard";

export function StAnnPrep() {
  const { date, set } = useDateMeal();
  const state = useAppState((s) => s);
  const suggestions = useMemo(() => menuSuggestions(state, date), [state, date]);
  return (
    <div className="space-y-3">
      <DateBar date={date} onChange={(d) => set({ date: d })} subtitle="Prep list starts here" />
      <PrepBoard ws="stann" baseDate={date} suggestions={suggestions} />
    </div>
  );
}
