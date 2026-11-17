/**
 * Export / restore of demo data, with schema validation on the way back in.
 * A workspace export can only be restored into the same workspace.
 */
import { z } from "zod";
import { WORKSPACE_IDS, type WorkspaceId } from "../workspaces";
import { migrate, migrateWorkspace, SCHEMA_VERSION, type AppState } from "./model";

const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const meal = z.enum(["breakfast", "lunch", "dinner"]);
const arr = <T extends z.ZodTypeAny>(t: T) => z.array(t).max(20_000);

const menuItem = z.looseObject({ id: z.string(), kind: z.string(), text: z.string(), printedLabel: z.string() });
const countEvent = z.looseObject({
  id: z.string(),
  seq: z.number().int(),
  at: z.string(),
  type: z.enum(["slip", "item", "undo", "resolve", "correction", "complete", "reopen"]),
});
const countSession = z.looseObject({
  id: z.string(),
  date: iso,
  meal,
  mode: z.enum(["quick", "detailed"]),
  options: arr(z.looseObject({ key: z.string(), label: z.string(), role: z.string() })),
  extras: arr(z.looseObject({ key: z.string(), label: z.string() })),
  expectedSlips: z.number().int().nonnegative().nullable(),
  events: arr(countEvent),
  status: z.enum(["counting", "complete"]),
  units: arr(z.string()),
  activeUnit: z.string().nullable(),
});
const prepTask = z.looseObject({ id: z.string(), date: iso, title: z.string(), done: z.boolean() });
const recipe = z.looseObject({
  id: z.string(),
  name: z.string(),
  yieldPortions: z.number().positive(),
  ingredients: arr(z.looseObject({ qty: z.number(), unit: z.string(), name: z.string() })),
  steps: arr(z.string()),
});
const inventory = z.looseObject({ id: z.string(), name: z.string(), qty: z.number(), unit: z.string(), par: z.number() });
const common = {
  profiles: arr(
    z.looseObject({
      id: z.string(),
      name: z.string(),
      meals: arr(meal),
      defaultMeal: z.union([meal, z.literal("auto")]),
      hiddenTabs: arr(z.string()),
    }),
  ),
  activeProfileId: z.string().nullable(),
  prep: arr(prepTask),
  templates: arr(z.looseObject({ id: z.string(), name: z.string(), tasks: arr(z.looseObject({ title: z.string() })) })),
  dismissedSuggestions: arr(z.string()),
  recipes: arr(recipe),
  inventory: arr(inventory),
  shopping: arr(z.looseObject({ id: z.string(), name: z.string(), done: z.boolean() })),
  audit: arr(z.looseObject({ id: z.string(), at: z.string(), action: z.string(), detail: z.string() })),
};

export const workspaceSchemas = {
  stann: z.looseObject({
    ...common,
    settings: z.looseObject({ identifierType: z.enum(["room", "name"]) }),
    rotation: z.looseObject({ seasonId: z.string(), week1Start: iso.nullable(), confirmed: z.boolean(), note: z.string() }),
    corrections: z.record(z.string(), z.looseObject({ text: z.string(), kind: z.string(), reviewed: z.boolean() })),
    menuHistory: arr(z.looseObject({ id: z.string(), itemId: z.string() })),
    overrides: z.record(z.string(), z.looseObject({ items: arr(menuItem), reason: z.string() })),
    counts: z.record(z.string(), countSession),
    production: z.record(z.string(), z.looseObject({ lines: arr(z.looseObject({ id: z.string(), label: z.string(), bufferPct: z.number() })), dismissed: arr(z.string()) })),
    productionDefaults: z.record(z.string(), z.looseObject({ bufferPct: z.number() })),
    readiness: z.record(z.string(), z.looseObject({ checked: z.record(z.string(), z.string()) })),
    temps: arr(z.looseObject({ id: z.string(), date: iso, meal, item: z.string(), kind: z.string(), tempF: z.number().min(-40).max(500) })),
    standingRequests: arr(z.looseObject({ id: z.string(), meal, identifier: z.string(), item: z.string(), active: z.boolean() })),
    requests: arr(
      z.looseObject({
        id: z.string(),
        date: iso,
        meal,
        identifier: z.string(),
        item: z.string(),
        quantity: z.number().int().positive(),
        verification: z.enum(["unverified", "verified", "flagged"]),
        status: z.enum(["not_started", "preparing", "ready", "served", "cancelled"]),
      }),
    ),
  }),
  truck: z.looseObject({
    ...common,
    menu: arr(z.looseObject({ id: z.string(), name: z.string(), price: z.number(), active: z.boolean() })),
    tickets: arr(z.looseObject({ id: z.string(), number: z.number(), date: iso, status: z.string(), lines: arr(z.looseObject({ menuItemId: z.string(), qty: z.number() })) })),
  }),
  home: z.looseObject({ ...common, mealPlan: z.record(iso, z.record(z.string(), z.string())) }),
} as const;

export const appStateSchema = z.looseObject({
  schemaVersion: z.literal(SCHEMA_VERSION),
  mode: z.literal("demo"),
  activeWorkspace: z.enum(WORKSPACE_IDS).nullable(),
  conversions: arr(z.looseObject({ id: z.string(), name: z.string().min(1).max(100), gramsPerCup: z.number().positive().max(5000) })),
  workspaces: z.object({ stann: workspaceSchemas.stann, truck: workspaceSchemas.truck, home: workspaceSchemas.home }),
});

export interface BackupFile {
  app: "kitchen-blockcards";
  kind: "full" | "workspace";
  workspace?: WorkspaceId;
  schemaVersion: number;
  exportedAt: string;
  data: unknown;
}

export function exportFull(state: AppState): BackupFile {
  return { app: "kitchen-blockcards", kind: "full", schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), data: state };
}

export function exportWorkspace(state: AppState, ws: WorkspaceId): BackupFile {
  return {
    app: "kitchen-blockcards",
    kind: "workspace",
    workspace: ws,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: state.workspaces[ws],
  };
}

export type RestoreResult = { ok: true; state: AppState; summary: string } | { ok: false; error: string };

function formatIssues(err: z.ZodError) {
  return err.issues
    .slice(0, 3)
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
}

/**
 * Validate a backup and return the state it would produce. A workspace backup
 * only replaces its own workspace (and only when `target` matches).
 */
export function restore(current: AppState, raw: string, target?: WorkspaceId): RestoreResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "That file isn't valid JSON." };
  }
  const header = z
    .object({ app: z.literal("kitchen-blockcards"), kind: z.enum(["full", "workspace"]), schemaVersion: z.number(), data: z.unknown(), workspace: z.enum(WORKSPACE_IDS).optional() })
    .safeParse(parsed);
  if (!header.success) return { ok: false, error: "This is not a Kitchen Blockcards backup file." };
  const file = header.data;
  if (file.schemaVersion < 1 || file.schemaVersion > SCHEMA_VERSION) return { ok: false, error: `Backup version ${file.schemaVersion} is not supported.` };

  if (file.kind === "full") {
    const res = appStateSchema.safeParse(migrate(file.data));
    if (!res.success) return { ok: false, error: `Backup failed validation — ${formatIssues(res.error)}` };
    return { ok: true, state: res.data as unknown as AppState, summary: "Restored all workspaces." };
  }
  const ws = file.workspace;
  if (!ws) return { ok: false, error: "Workspace backup is missing its workspace name." };
  if (target && target !== ws) {
    return { ok: false, error: `This backup belongs to the ${ws} workspace and can't be restored into ${target}.` };
  }
  const res = workspaceSchemas[ws].safeParse(migrateWorkspace(ws, file.data, file.schemaVersion));
  if (!res.success) return { ok: false, error: `Backup failed validation — ${formatIssues(res.error)}` };
  return {
    ok: true,
    state: { ...current, workspaces: { ...current.workspaces, [ws]: res.data } } as AppState,
    summary: `Restored the ${ws} workspace.`,
  };
}
