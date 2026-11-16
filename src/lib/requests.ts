/**
 * Special resident requests — the "Request" box under the tallies in the notebook.
 *
 * Safety rules enforced here:
 *  - A request is never "verified" by the app. A person must record that they
 *    checked it against the facility's current authorized diet order.
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
  verified: "Checked against diet order",
  flagged: "Flagged for staff review",
};

export interface SpecialRequest {
  id: string;
  date: ISODate;
  meal: MealService;
  /** Room number or name, per the workspace setting. Demo data uses fictional rooms only. */
  identifier: string;
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
    createdAt: now,
    updatedAt: now,
  };
}

/** Record that a person checked the request against the current authorized diet order. */
export function markVerified(req: SpecialRequest, initials: string): SpecialRequest {
  const who = initials.trim();
  if (!who) throw new Error("Enter your initials to record who checked the diet order");
  const now = nowISO();
  const { flagReason: _drop, ...rest } = req;
  return { ...rest, verification: "verified", verifiedBy: who, verifiedAt: now, updatedAt: now };
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
