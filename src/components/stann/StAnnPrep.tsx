"use client";
import { useMemo } from "react";
import { useAppState } from "@/lib/state/store";
import { DateBar, useDateMeal } from "../DateMealBar";
import { PrepBoard } from "../PrepBoard";
import { ServiceFlow } from "./ServiceFlow";
import { pickMeal } from "@/lib/profiles";
import { useProfile } from "../useProfile";
import { menuSuggestions } from "./TodayDashboard";

export function StAnnPrep() {
  const profile0 = useProfile("stann");
  const { date, meal, set } = useDateMeal(pickMeal(profile0));
  const state = useAppState((s) => s);
  const profile = useProfile("stann");
  const suggestions = useMemo(() => menuSuggestions(state, date, 3, profile.meals), [state, date, profile.meals]);
  return (
    <div className="space-y-3">
      <DateBar date={date} onChange={(d) => set({ date: d })} subtitle="Prep list starts here" />
      <ServiceFlow date={date} meal={meal} current="prep" />
      <PrepBoard ws="stann" baseDate={date} suggestions={suggestions} meals={profile.meals} />
    </div>
  );
}
