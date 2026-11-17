"use client";
import { useMemo } from "react";
import { useAppState } from "@/lib/state/store";
import { DateBar, useDateMeal } from "../DateMealBar";
import { PrepBoard } from "../PrepBoard";
import { useProfile } from "../useProfile";
import { menuSuggestions } from "./TodayDashboard";

export function StAnnPrep() {
  const { date, set } = useDateMeal();
  const state = useAppState((s) => s);
  const profile = useProfile("stann");
  const suggestions = useMemo(() => menuSuggestions(state, date, 3, profile.meals), [state, date, profile.meals]);
  return (
    <div className="space-y-3">
      <DateBar date={date} onChange={(d) => set({ date: d })} subtitle="Prep list starts here" />
      <PrepBoard ws="stann" baseDate={date} suggestions={suggestions} meals={profile.meals} />
    </div>
  );
}
