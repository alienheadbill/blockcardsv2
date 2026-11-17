/**
 * Application state. Each workspace owns its data outright — nothing is shared
 * between St. Ann, Stop N Chop and Home, so switching workspaces can never mix
 * resident records with food-truck or personal data.
 */
import type { CountSession } from "../counting";
import type { ISODate } from "../dates";
import { newId, nowISO } from "../ids";
import type { MenuCorrection, MenuHistoryEntry, MenuOverride, RotationConfig } from "../menu/rotation";
import type { MealService } from "../menu/types";
import type { PrepTask, PrepTemplate } from "../prep";
import { makeRecipe, starterRecipes, type Recipe } from "../recipes/recipes";
import type { SpecialRequest, StandingRequest } from "../requests";
import type { CustomConversion } from "../recipes/convert";
import type { ProductionDefault, ProductionPlan } from "../production";
import { DEFAULT_CHECKLIST, NO_RULES, type ChecklistItem, type ReadinessRecord, type TempEntry, type TempRules } from "../readiness";
import { defaultProfiles, PROFILE_PRESETS, profileFromPreset, type Profile } from "../profiles";
import type { WorkspaceId } from "../workspaces";

export const SCHEMA_VERSION = 6;

export interface AuditEvent {
  id: string;
  at: string;
  action: string;
  detail: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  qty: number;
  unit: string;
  par: number;
  unitCost: number | null;
  updatedAt: string;
}

export interface ShoppingItem {
  id: string;
  name: string;
  qty: string;
  done: boolean;
  source: "manual" | "inventory" | "meal-plan";
}

interface Common {
  /** Who's using this workspace on this device, and what they see. */
  profiles: Profile[];
  activeProfileId: string | null;
  prep: PrepTask[];
  templates: PrepTemplate[];
  dismissedSuggestions: string[];
  recipes: Recipe[];
  inventory: InventoryItem[];
  shopping: ShoppingItem[];
  audit: AuditEvent[];
}

export interface StAnnData extends Common {
  settings: {
    identifierType: "room" | "name";
    servingTimes: Record<MealService, string>;
    defaultCountMode: "quick" | "detailed";
    showTallyMarks: boolean;
    /** Unit slip stacks, counted separately (Granite, Lilac, Birch). Empty = one stack. */
    units: string[];
    /** Meal the Counts screen opens on. "auto" picks by time of day. */
    defaultMeal: MealService | "auto";
    /** Also show the menu's sides/desserts/fruit as counters (off: only entrées + modifications). */
    countMenuSides: boolean;
    /** Vibrate on each count tap where the phone supports it (not iPhone Safari). */
    hapticFeedback?: boolean;
    /** Smaller count screen so both boxes and Undo fit without scrolling. */
    compactCounting?: boolean;
    /** Ignore a second tap on the same box within this many ms (0 = off). */
    tapGuardMs?: number;
    /** Keep tap-by-tap logs of completed counts this many days, then keep totals + corrections only (0 = forever). */
    keepTapLogDays?: number;
    /** Service readiness checklist items. */
    checklist: ChecklistItem[];
    /** Temperature limits, as approved by the facility. All blank until someone sets them. */
    tempRules: TempRules;
    /** When someone confirmed the limits match the facility's approved procedures. */
    tempRulesConfirmed: { at: string; note: string } | null;
  };
  rotation: RotationConfig;
  corrections: Record<string, MenuCorrection>;
  menuHistory: MenuHistoryEntry[];
  overrides: Record<string, MenuOverride>;
  counts: Record<string, CountSession>;
  requests: SpecialRequest[];
  standingRequests: StandingRequest[];
  /** Production plan per service (key = date|meal). */
  production: Record<string, ProductionPlan>;
  /** Last-used portion / yield / buffer / recipe per dish name. */
  productionDefaults: Record<string, ProductionDefault>;
  /** Checklist state per service (key = date|meal). */
  readiness: Record<string, ReadinessRecord>;
  temps: TempEntry[];
}

export interface TruckMenuItem {
  id: string;
  name: string;
  price: number;
  recipeId?: string;
  active: boolean;
}

export type TicketStatus = "open" | "preparing" | "ready" | "served" | "cancelled";

export interface Ticket {
  id: string;
  number: number;
  date: ISODate;
  lines: { menuItemId: string; qty: number }[];
  note: string;
  status: TicketStatus;
  createdAt: string;
}

export interface TruckData extends Common {
  menu: TruckMenuItem[];
  tickets: Ticket[];
}

export interface HomeData extends Common {
  mealPlan: Record<ISODate, Partial<Record<MealService, string>>>;
}

export interface AppState {
  schemaVersion: typeof SCHEMA_VERSION;
  /** "demo" = fictional data, browser storage. Facility mode requires the approved server deployment. */
  mode: "demo";
  activeWorkspace: WorkspaceId | null;
  /** The cook's own weight↔volume conversions ("1 cup of X weighs Y"). Not workspace data — just kitchen facts. */
  conversions: CustomConversion[];
  workspaces: { stann: StAnnData; truck: TruckData; home: HomeData };
}

/** Unit names the facility uses; offered as a suggestion in settings (off by default). */
export const DEFAULT_UNITS = ["Granite", "Lilac", "Birch"];

export const DEFAULT_STANN_SETTINGS: StAnnData["settings"] = {
  identifierType: "room",
  servingTimes: { breakfast: "07:30", lunch: "12:00", dinner: "16:45" },
  defaultCountMode: "quick",
  showTallyMarks: true,
  units: [],
  defaultMeal: "dinner",
  countMenuSides: false,
  hapticFeedback: true,
  compactCounting: false,
  tapGuardMs: 300,
  keepTapLogDays: 120,
  checklist: DEFAULT_CHECKLIST,
  tempRules: NO_RULES,
  tempRulesConfirmed: null,
};

export const CONFIRMED_ANCHOR_NOTE =
  "Confirmed by the cook on 11/16/2026: Monday 11/16 is Week 2 (Vegetable Frittata / Chicken Pot Pie dinner).";

export type WorkspaceData<W extends WorkspaceId> = AppState["workspaces"][W];

function common(ws: WorkspaceId, recipes: Recipe[] = []): Common {
  return { ...defaultProfiles(ws), prep: [], templates: [], dismissedSuggestions: [], recipes, inventory: [], shopping: [], audit: [] };
}

function inv(name: string, qty: number, unit: string, par: number, unitCost: number | null = null): InventoryItem {
  return { id: newId("inv"), name, qty, unit, par, unitCost, updatedAt: nowISO() };
}

export function initialState(): AppState {
  const truckRecipes = [
    makeRecipe({
      name: "Smash Burger",
      category: "Sandwich",
      yieldPortions: 1,
      portionSize: "1 burger",
      source: "user",
      ingredients: [
        [4, "oz", "ground beef (80/20)"],
        [1, "each", "potato bun"],
        [1, "slice", "American cheese"],
        [1, "tbsp", "house sauce"],
        [1, "tbsp", "pickles, sliced"],
      ],
      steps: ["Ball the beef, smash hard on a ripping-hot flat-top.", "Season, flip at a crust, cheese on.", "Toast bun, sauce, pickles, assemble."],
      equipment: ["Flat-top", "Smasher", "Spatula"],
      activeMinutes: 4,
      totalMinutes: 5,
      aheadNotes: "Pre-ball beef into 4 oz portions before service.",
      safetyCheckpoints: ["Cook ground beef to your health department's required temperature and log it."],
      allergens: ["Wheat/Gluten", "Milk", "Egg (sauce)"],
      costPerBatch: 2.35,
    }),
  ];
  const truckBurger = truckRecipes[0]!;

  const truck: TruckData = {
    ...common("truck", truckRecipes),
    menu: [
      { id: newId("tm"), name: "Smash Burger", price: 9, recipeId: truckBurger.id, active: true },
      { id: newId("tm"), name: "Chicken Cheesesteak", price: 11, active: true },
      { id: newId("tm"), name: "Loaded Fries", price: 6, active: true },
      { id: newId("tm"), name: "Lemonade", price: 3, active: true },
    ],
    tickets: [],
    inventory: [
      inv("Potato buns", 40, "each", 60, 0.45),
      inv("Ground beef", 12, "lb", 15, 5.2),
      inv("American cheese", 80, "slice", 60, 0.12),
      inv("Fries (frozen)", 3, "case", 4, 38),
      inv("Lemons", 18, "each", 30, 0.4),
    ],
  };

  const home: HomeData = {
    ...common("home", starterRecipes().filter((r) => /Macaroni|Chicken Noodle/.test(r.name)).map((r) => ({ ...r, source: "user" as const }))),
    mealPlan: {},
    inventory: [inv("Rice", 2, "lb", 1), inv("Pasta", 1, "lb", 2), inv("Eggs", 6, "each", 12), inv("Milk", 0.5, "gal", 1)],
  };

  const stann: StAnnData = {
    ...common("stann", starterRecipes()),
    settings: { ...DEFAULT_STANN_SETTINGS, units: [] },
    rotation: { seasonId: "fall-winter", week1Start: "2026-11-08", confirmed: true, note: CONFIRMED_ANCHOR_NOTE },
    corrections: {},
    menuHistory: [],
    overrides: {},
    counts: {},
    requests: [],
    standingRequests: [],
    production: {},
    productionDefaults: {},
    readiness: {},
    temps: [],
    templates: [
      {
        id: newId("tpl"),
        name: "Dinner line setup",
        tasks: [
          { title: "Set out serving equipment & utensils" },
          { title: "Fill steam table wells", holdingReminder: "Hold hot per facility-approved temperature; log temps." },
          { title: "Set cold well / ice for salads & desserts", holdingReminder: "Keep cold per facility standard." },
          { title: "Stack plates, lids and tray tickets" },
        ],
      },
      {
        id: newId("tpl"),
        name: "Close-out",
        tasks: [
          { title: "Label & date leftovers", holdingReminder: "Cool per facility two-stage cooling procedure." },
          { title: "Pull proteins for tomorrow", holdingReminder: "Thaw under refrigeration." },
          { title: "Wipe down & sanitize stations" },
        ],
      },
    ],
  };

  return { schemaVersion: SCHEMA_VERSION, mode: "demo", activeWorkspace: null, conversions: [], workspaces: { stann, truck, home } };
}

export function audit(action: string, detail: string): AuditEvent {
  return { id: newId("aud"), at: nowISO(), action, detail };
}

const AUDIT_LIMIT = 1000;

/** Immutable update of one workspace, optionally appending an audit entry. */
export function updateWorkspace<W extends WorkspaceId>(
  state: AppState,
  ws: W,
  fn: (data: WorkspaceData<W>) => WorkspaceData<W>,
  log?: { action: string; detail: string },
): AppState {
  let next = fn(state.workspaces[ws]);
  if (log) next = { ...next, audit: [audit(log.action, log.detail), ...next.audit].slice(0, AUDIT_LIMIT) };
  return { ...state, workspaces: { ...state.workspaces, [ws]: next } };
}

/**
 * Bring saved data from older versions up to date. Never drops data:
 * only fills in fields that newer versions added.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function migrate(raw: any): any {
  if (!raw || typeof raw !== "object" || typeof raw.schemaVersion !== "number") return raw;
  if (raw.schemaVersion === 1) {
    const st = raw.workspaces?.stann;
    if (st) {
      const old = st.settings ?? {};
      st.settings = {
        ...DEFAULT_STANN_SETTINGS,
        ...old,
        // 5:00 was a placeholder; the kitchen serves dinner at 4:45.
        servingTimes: { ...DEFAULT_STANN_SETTINGS.servingTimes, ...(old.servingTimes ?? {}), ...(old.servingTimes?.dinner === "17:00" ? { dinner: "16:45" } : {}) },
        units: Array.isArray(old.units) ? old.units : [],
      };
      st.standingRequests ??= [];
      if (st.rotation && st.rotation.week1Start === "2026-11-08" && !st.rotation.confirmed) {
        st.rotation = { ...st.rotation, confirmed: true, note: CONFIRMED_ANCHOR_NOTE };
      }
      for (const c of Object.values(st.counts ?? {}) as { units?: string[]; activeUnit?: string | null }[]) {
        c.units ??= [];
        c.activeUnit ??= null;
      }
    }
    raw.schemaVersion = 2;
  }
  if (raw.schemaVersion === 2) {
    // Units turned out not to matter to the cook: switch off the default Granite/Lilac/Birch tabs.
    const settings = raw.workspaces?.stann?.settings;
    if (settings && Array.isArray(settings.units) && settings.units.join("|") === DEFAULT_UNITS.join("|")) settings.units = [];
    raw.schemaVersion = 3;
  }
  if (raw.schemaVersion === 3) {
    raw.conversions ??= [];
    raw.schemaVersion = 4;
  }
  if (raw.schemaVersion === 4) {
    for (const ws of ["stann", "truck", "home"] as const) {
      const data = raw.workspaces?.[ws];
      if (!data || Array.isArray(data.profiles)) continue;
      const profiles = PROFILE_PRESETS[ws].map((p) => profileFromPreset(p));
      // St. Ann: the night (dinner) cook is this app's main user; keep their saved "opens on" choice.
      if (ws === "stann" && data.settings?.defaultMeal && data.settings.defaultMeal !== "dinner") {
        const all = profiles.find((p) => p.presetId === "all")!;
        data.activeProfileId = all.id;
      } else data.activeProfileId = profiles[0]!.id;
      data.profiles = profiles;
    }
    raw.schemaVersion = 5;
  }
  if (raw.schemaVersion === 5) {
    const st = raw.workspaces?.stann;
    if (st) {
      st.production ??= {};
      st.productionDefaults ??= {};
      st.readiness ??= {};
      st.temps ??= [];
      st.settings = { ...st.settings };
      st.settings.checklist ??= DEFAULT_CHECKLIST;
      st.settings.tempRules ??= NO_RULES;
      st.settings.tempRulesConfirmed ??= null;
    }
    raw.schemaVersion = 6;
  }
  return raw;
}

/** Same as `migrate`, for a single St. Ann workspace object from a workspace backup. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function migrateWorkspace(ws: string, data: any, fromVersion: number): any {
  if (fromVersion >= SCHEMA_VERSION || ws !== "stann") return data;
  const wrapped = migrate({ schemaVersion: fromVersion, workspaces: { stann: data } });
  return wrapped.workspaces.stann;
}
