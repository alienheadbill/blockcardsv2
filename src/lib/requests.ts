/**
 * Special resident requests — the "Request" box under the tallies in the notebook.
 *
 * Safety rules enforced here:
 *  - A request is never "verified" by the app. A person (cook, nurse or dietary
 *    aide) taps "Diet checked" after looking at the resident's current diet order.
 *    No initials or separate sign-off are required.
 *  - Room number / name is only an identifier. It is never used to look up or
 *    infer a diet, texture or allergy.
 *  - A request flagged for review cannot be moved to Ready/Served.
 */
import type { ISODate } from "./dates";
import { newId, nowISO } from "./ids";
import type { MealService } from "./menu/types";

export const PRODUCTION_STATUSES = ["not_started", "preparing", "ready", "served", "cancelled"] as const;
export type ProductionStatus = (typeof PRODUCTION_STATUSES)[number];
export const STATUS_LABELS: Record<ProductionStatus, string> = {
  not_started: "Not Started",
  preparing: "Preparing",
  ready: "Ready",
  served: "Served",
  cancelled: "Cancelled",
};

export const VERIFICATION_STATUSES = ["unverified", "verified", "flagged"] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];
export const VERIFICATION_LABELS: Record<VerificationStatus, string> = {
  unverified: "Not yet checked",
  verified: "Diet checked",
  flagged: "Flagged for staff review",
};

export interface SpecialRequest {
  id: string;
  date: ISODate;
  meal: MealService;
  /** Room number + side (e.g. "207R") or name, per the workspace setting. Demo data uses fictional rooms only. */
  identifier: string;
  /** Unit the resident is on (Granite, Lilac, Birch…), if known. */
  unit?: string;
  /** Set when the request came from a daily regular. */
  standingId?: string;
  item: string;
  quantity: number;
  notes: string;
  verification: VerificationStatus;
  verifiedBy?: string;
  verifiedAt?: string;
  flagReason?: string;
  status: ProductionStatus;
  /** Optional link to the count session for the same service. */
  countSessionId?: string;
  createdAt: string;
  updatedAt: string;
}

export function createRequest(input: {
  date: ISODate;
  meal: MealService;
  identifier: string;
  item: string;
  quantity?: number;
  notes?: string;
  unit?: string;
  standingId?: string;
  countSessionId?: string;
}): SpecialRequest {
  const identifier = input.identifier.trim();
  const item = input.item.trim();
  if (!identifier) throw new Error("Room or name is required");
  if (!item) throw new Error("Requested item is required");
  const quantity = input.quantity ?? 1;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) throw new Error("Quantity must be 1–99");
  const now = nowISO();
  return {
    id: newId("req"),
    date: input.date,
    meal: input.meal,
    identifier,
    item,
    quantity,
    notes: (input.notes ?? "").trim(),
    verification: "unverified",
    status: "not_started",
    ...(input.countSessionId ? { countSessionId: input.countSessionId } : {}),
    ...(input.unit ? { unit: input.unit } : {}),
    ...(input.standingId ? { standingId: input.standingId } : {}),
    createdAt: now,
    updatedAt: now,
  };
}

/** Record that someone checked the request against the resident's current diet order. */
export function markVerified(req: SpecialRequest, who = ""): SpecialRequest {
  const now = nowISO();
  const { flagReason: _drop, verifiedBy: _old, ...rest } = req;
  return { ...rest, verification: "verified", ...(who.trim() ? { verifiedBy: who.trim() } : {}), verifiedAt: now, updatedAt: now };
}

/** Undo an accidental "Diet checked" tap. */
export function unmarkVerified(req: SpecialRequest): SpecialRequest {
  const { verifiedBy: _a, verifiedAt: _b, ...rest } = req;
  return { ...rest, verification: "unverified", updatedAt: nowISO() };
}

/** Room number with bed side: "207R", "103L". */
export function formatRoom(number: string, side: "L" | "R" | ""): string {
  const n = number.trim().replace(/\s+/g, " ");
  if (!n) return "";
  return `${n}${side}`;
}

const ROOM_RE = /^(.*?)(\d+)\s*([LR])?$/i;
export function parseRoom(identifier: string): { number: string; side: "L" | "R" | "" } {
  const m = identifier.trim().match(ROOM_RE);
  if (!m) return { number: identifier.trim(), side: "" };
  return { number: `${m[1] ?? ""}${m[2]}`, side: ((m[3] ?? "").toUpperCase() as "L" | "R" | "") };
}

/** A daily regular — someone who gets the same request every day for a meal. */
export interface StandingRequest {
  id: string;
  meal: MealService;
  identifier: string;
  unit?: string;
  item: string;
  quantity: number;
  notes: string;
  active: boolean;
  createdAt: string;
}

export function createStanding(input: { meal: MealService; identifier: string; item: string; quantity?: number; notes?: string; unit?: string }): StandingRequest {
  const probe = createRequest({ ...input, date: "2000-01-01" }); // reuse validation
  return {
    id: newId("std"),
    meal: input.meal,
    identifier: probe.identifier,
    ...(probe.unit ? { unit: probe.unit } : {}),
    item: probe.item,
    quantity: probe.quantity,
    notes: probe.notes,
    active: true,
    createdAt: nowISO(),
  };
}

/** Daily regulars not yet added for this date & meal. */
export function pendingStanding(standing: StandingRequest[], requests: SpecialRequest[], date: ISODate, meal: MealService): StandingRequest[] {
  const used = new Set(requests.filter((r) => r.date === date && r.meal === meal && r.standingId).map((r) => r.standingId));
  return standing.filter((s) => s.active && s.meal === meal && !used.has(s.id));
}

export function fromStanding(s: StandingRequest, date: ISODate, countSessionId?: string): SpecialRequest {
  return createRequest({
    date,
    meal: s.meal,
    identifier: s.identifier,
    item: s.item,
    quantity: s.quantity,
    notes: s.notes,
    standingId: s.id,
    ...(s.unit ? { unit: s.unit } : {}),
    ...(countSessionId ? { countSessionId } : {}),
  });
}

export function flagForReview(req: SpecialRequest, reason: string): SpecialRequest {
  if (!reason.trim()) throw new Error("Say why this request needs review");
  const { verifiedBy: _a, verifiedAt: _b, ...rest } = req;
  return { ...rest, verification: "flagged", flagReason: reason.trim(), updatedAt: nowISO() };
}

export function setStatus(req: SpecialRequest, status: ProductionStatus): SpecialRequest {
  if ((status === "ready" || status === "served") && req.verification === "flagged") {
    throw new Error("This request is flagged for staff review and cannot be marked ready or served.");
  }
  return { ...req, status, updatedAt: nowISO() };
}

export const needsAttention = (r: SpecialRequest) =>
  r.status !== "cancelled" && r.status !== "served" && (r.verification !== "verified" || r.status === "not_started");

export interface RequestGroup {
  item: string;
  totalQuantity: number;
  requests: SpecialRequest[];
}

/** Group identical dishes for production totals; individual requests stay listed. */
export function groupRequests(requests: SpecialRequest[]): RequestGroup[] {
  const map = new Map<string, RequestGroup>();
  for (const r of requests) {
    if (r.status === "cancelled") continue;
    const key = r.item.trim().toLowerCase().replace(/\s+/g, " ");
    const g = map.get(key) ?? { item: r.item.trim(), totalQuantity: 0, requests: [] };
    g.totalQuantity += r.quantity;
    g.requests.push(r);
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) => b.totalQuantity - a.totalQuantity || a.item.localeCompare(b.item));
}
