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
import type { SpecialRequest } from "../requests";
import type { WorkspaceId } from "../workspaces";

export const SCHEMA_VERSION = 1;

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
  };
  rotation: RotationConfig;
  corrections: Record<string, MenuCorrection>;
  menuHistory: MenuHistoryEntry[];
  overrides: Record<string, MenuOverride>;
  counts: Record<string, CountSession>;
  requests: SpecialRequest[];
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
  workspaces: { stann: StAnnData; truck: TruckData; home: HomeData };
}

export type WorkspaceData<W extends WorkspaceId> = AppState["workspaces"][W];

function common(recipes: Recipe[] = []): Common {
  return { prep: [], templates: [], dismissedSuggestions: [], recipes, inventory: [], shopping: [], audit: [] };
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
    ...common(truckRecipes),
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
    ...common(starterRecipes().filter((r) => /Macaroni|Chicken Noodle/.test(r.name)).map((r) => ({ ...r, source: "user" as const }))),
    mealPlan: {},
    inventory: [inv("Rice", 2, "lb", 1), inv("Pasta", 1, "lb", 2), inv("Eggs", 6, "each", 12), inv("Milk", 0.5, "gal", 1)],
  };

  const stann: StAnnData = {
    ...common(starterRecipes()),
    settings: {
      identifierType: "room",
      servingTimes: { breakfast: "07:30", lunch: "12:00", dinner: "17:00" },
      defaultCountMode: "quick",
      showTallyMarks: true,
    },
    rotation: {
      seasonId: "fall-winter",
      week1Start: "2026-11-08",
      confirmed: false,
      note:
        "Suggested from the photographed supper slip dated Monday the 16th (Vegetable Frittata / Chicken Pot Pie, which is Week 2 Monday dinner). Confirm against the facility's posted schedule before relying on it.",
    },
    corrections: {},
    menuHistory: [],
    overrides: {},
    counts: {},
    requests: [],
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

  return { schemaVersion: SCHEMA_VERSION, mode: "demo", activeWorkspace: null, workspaces: { stann, truck, home } };
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
