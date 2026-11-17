/**
 * Profiles: who's using the app and what they want to see. These are view
 * preferences on this device (not logins) — the kitchen's data is shared
 * by everyone in the workspace.
 */
import { newId } from "./ids";
import { MEAL_SERVICES, type MealService } from "./menu/types";
import type { WorkspaceId } from "./workspaces";

export interface Profile {
  id: string;
  name: string;
  /** e.g. "11 AM – 7 PM" */
  shift: string;
  /** Meals this person works (St. Ann). Others are hidden but one tap away. */
  meals: MealService[];
  /** Meal the Counts screen opens on; "auto" = whichever of `meals` is next by time. */
  defaultMeal: MealService | "auto";
  /** Bottom-nav tabs this person doesn't need (by href). */
  hiddenTabs: string[];
  presetId: string;
}

export interface ProfilePreset extends Omit<Profile, "id"> {
  description: string;
}

export const PROFILE_PRESETS: Record<WorkspaceId, ProfilePreset[]> = {
  stann: [
    {
      presetId: "night",
      name: "Night cook",
      shift: "11 AM – 7 PM",
      meals: ["dinner"],
      defaultMeal: "dinner",
      hiddenTabs: [],
      description: "Dinner only. Lunch and breakfast stay one tap away for trayed sausage or a lunch dessert.",
    },
    {
      presetId: "day",
      name: "Day cook",
      shift: "6 AM – 2 PM",
      meals: ["breakfast", "lunch"],
      defaultMeal: "auto",
      hiddenTabs: [],
      description: "Breakfast and lunch.",
    },
    {
      presetId: "all",
      name: "Everything",
      shift: "",
      meals: [...MEAL_SERVICES],
      defaultMeal: "auto",
      hiddenTabs: [],
      description: "All three meals — for managers or covering both shifts.",
    },
  ],
  truck: [
    {
      presetId: "owner",
      name: "Owner",
      shift: "",
      meals: [...MEAL_SERVICES],
      defaultMeal: "auto",
      hiddenTabs: [],
      description: "Everything: orders, prep, menu, stock, recipes and sales.",
    },
    {
      presetId: "line",
      name: "Line cook",
      shift: "",
      meals: [...MEAL_SERVICES],
      defaultMeal: "auto",
      hiddenTabs: ["/truck/menu", "/truck/inventory", "/truck/reports"],
      description: "Just orders, prep and recipes.",
    },
  ],
  home: [
    {
      presetId: "me",
      name: "Me",
      shift: "",
      meals: [...MEAL_SERVICES],
      defaultMeal: "auto",
      hiddenTabs: [],
      description: "Everything.",
    },
  ],
};

export function profileFromPreset(preset: ProfilePreset, name?: string): Profile {
  const { description: _d, ...rest } = preset;
  return { ...rest, meals: [...rest.meals], hiddenTabs: [...rest.hiddenTabs], id: newId("pf"), ...(name?.trim() ? { name: name.trim() } : {}) };
}

/** Starting profiles for a workspace and which one is active. */
export function defaultProfiles(ws: WorkspaceId): { profiles: Profile[]; activeProfileId: string } {
  const profiles = PROFILE_PRESETS[ws].map((p) => profileFromPreset(p));
  return { profiles, activeProfileId: profiles[0]!.id };
}

/** Used when nothing is set up: shows everything. */
export const EVERYTHING: Profile = {
  id: "everything",
  name: "Everything",
  shift: "",
  meals: [...MEAL_SERVICES],
  defaultMeal: "auto",
  hiddenTabs: [],
  presetId: "all",
};

export function validateProfile(p: Profile): Profile {
  const name = p.name.trim();
  if (!name) throw new Error("Give the profile a name");
  const meals = MEAL_SERVICES.filter((m) => p.meals.includes(m));
  if (!meals.length) throw new Error("Pick at least one meal");
  const defaultMeal = p.defaultMeal === "auto" || meals.includes(p.defaultMeal) ? p.defaultMeal : meals[0]!;
  return { ...p, name, shift: p.shift.trim(), meals, defaultMeal };
}

/** Which meal to open on right now for this profile. */
export function pickMeal(profile: Profile, now = new Date()): MealService {
  if (profile.defaultMeal !== "auto") return profile.defaultMeal;
  const h = now.getHours();
  const byTime: MealService = h < 10 ? "breakfast" : h < 15 ? "lunch" : "dinner";
  if (profile.meals.includes(byTime)) return byTime;
  // nearest meal this person works
  const order = MEAL_SERVICES.indexOf(byTime);
  return [...profile.meals].sort((a, b) => Math.abs(MEAL_SERVICES.indexOf(a) - order) - Math.abs(MEAL_SERVICES.indexOf(b) - order))[0]!;
}
