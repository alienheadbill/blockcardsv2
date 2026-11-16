"use client";
import { useMemo, useState } from "react";
import type { ISODate } from "@/lib/dates";
import { MEAL_LABELS, type MealService } from "@/lib/menu/types";
import * as R from "@/lib/requests";
import * as ops from "@/lib/state/ops";
import { useAppState } from "@/lib/state/store";
import { act, Badge, Banner, Button, Card, Empty, Field, inputCls, Sheet } from "../ui";

const NEXT_STATUS: Partial<Record<R.ProductionStatus, R.ProductionStatus>> = {
  not_started: "preparing",
  preparing: "ready",
  ready: "served",
};

const STATUS_TONE: Record<R.ProductionStatus, "neutral" | "warn" | "ok" | "accent" | "danger"> = {
  not_started: "neutral",
  preparing: "accent",
  ready: "ok",
  served: "ok",
  cancelled: "danger",
};

export function RequestsPanel({ date, meal, countSessionId }: { date: ISODate; meal: MealService; countSessionId?: string }) {
  const all = useAppState((s) => s.workspaces.stann.requests);
  const idType = useAppState((s) => s.workspaces.stann.settings.identifierType);
  const requests = useMemo(() => all.filter((r) => r.date === date && r.meal === meal), [all, date, meal]);
  const groups = useMemo(() => R.groupRequests(requests), [requests]);
  const [adding, setAdding] = useState(false);
  const [verifyFor, setVerifyFor] = useState<R.SpecialRequest | null>(null);
  const [flagFor, setFlagFor] = useState<R.SpecialRequest | null>(null);

  return (
    <Card
      title={
        <span>
          Requests <span className="text-muted">({requests.filter((r) => r.status !== "cancelled").length})</span>
        </span>
      }
      action={
        <Button size="sm" onClick={() => setAdding(true)}>
          + Request
        </Button>
      }
    >
      {requests.length === 0 ? (
        <Empty>No special requests for {MEAL_LABELS[meal].toLowerCase()} yet.</Empty>
      ) : (
        <>
          {groups.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2" aria-label="Production totals">
              {groups.map((g) => (
                <span key={g.item} className="rounded-lg bg-surface-2 px-2 py-1 text-sm font-bold">
                  {g.item} × {g.totalQuantity}
                </span>
              ))}
            </div>
          )}
          <ul className="paper divide-y divide-rule rounded-xl border border-line">
            {requests.map((r) => (
              <li key={r.id} className="px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-base font-bold">
                      {r.item}
                      {r.quantity > 1 && <span className="text-muted"> × {r.quantity}</span>}
                      <span className="font-semibold text-muted"> — {r.identifier}</span>
                    </p>
                    {r.notes && <p className="text-sm text-muted">Note: {r.notes}</p>}
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Badge tone={r.verification === "verified" ? "ok" : r.verification === "flagged" ? "danger" : "warn"}>
                        {R.VERIFICATION_LABELS[r.verification]}
                        {r.verifiedBy ? ` (${r.verifiedBy})` : ""}
                      </Badge>
                      <Badge tone={STATUS_TONE[r.status]}>{R.STATUS_LABELS[r.status]}</Badge>
                    </div>
                    {r.flagReason && <p className="mt-1 text-xs font-semibold text-danger">Flag: {r.flagReason}</p>}
                  </div>
                </div>
                {r.status !== "cancelled" && r.status !== "served" && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {NEXT_STATUS[r.status] && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => act((s) => ops.updateRequest(s, r.id, (x) => R.setStatus(x, NEXT_STATUS[r.status]!), "request.status"))}
                      >
                        → {R.STATUS_LABELS[NEXT_STATUS[r.status]!]}
                      </Button>
                    )}
                    {r.verification !== "verified" && (
                      <Button size="sm" variant="outline" onClick={() => setVerifyFor(r)}>
                        Checked diet order
                      </Button>
                    )}
                    {r.verification !== "flagged" && (
                      <Button size="sm" variant="ghost" onClick={() => setFlagFor(r)}>
                        Flag
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => act((s) => ops.updateRequest(s, r.id, (x) => R.setStatus(x, "cancelled"), "request.cancel"))}>
                      Cancel
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <AddRequestSheet open={adding} onClose={() => setAdding(false)} date={date} meal={meal} idType={idType} countSessionId={countSessionId} />
      <PromptSheet
        open={!!verifyFor}
        title="Checked against diet order"
        label="Your initials"
        help="Confirm you checked this request against the resident's current authorized diet order (diet, texture, liquids, allergies). The app does not verify this for you."
        confirm="Record check"
        onClose={() => setVerifyFor(null)}
        onSubmit={(v) => !!verifyFor && act((s) => ops.updateRequest(s, verifyFor.id, (x) => R.markVerified(x, v), "request.verify"))}
      />
      <PromptSheet
        open={!!flagFor}
        title="Flag for staff review"
        label="What needs review?"
        help="e.g. request conflicts with slip, unclear texture, possible allergen. Flagged requests can't be marked ready or served."
        confirm="Flag request"
        onClose={() => setFlagFor(null)}
        onSubmit={(v) => !!flagFor && act((s) => ops.updateRequest(s, flagFor.id, (x) => R.flagForReview(x, v), "request.flag"))}
      />
    </Card>
  );
}

function AddRequestSheet({
  open,
  onClose,
  date,
  meal,
  idType,
  countSessionId,
}: {
  open: boolean;
  onClose: () => void;
  date: ISODate;
  meal: MealService;
  idType: "room" | "name";
  countSessionId?: string;
}) {
  const [identifier, setIdentifier] = useState("");
  const [item, setItem] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const submit = () => {
    const ok = act(
      (s) => ops.addRequest(s, { date, meal, identifier, item, quantity, notes, ...(countSessionId ? { countSessionId } : {}) }),
      "Request added",
    );
    if (ok) {
      setIdentifier("");
      setItem("");
      setQuantity(1);
      setNotes("");
      onClose();
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title={`New request · ${MEAL_LABELS[meal]}`}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Banner>Demo mode: use fictional rooms only (e.g. “Demo 104”). A room number is never a diet source — check the current diet order.</Banner>
        <Field label={idType === "room" ? "Room" : "Resident name"}>
          <input className={inputCls} value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder={idType === "room" ? "Demo 207R" : "Name"} autoComplete="off" />
        </Field>
        <Field label="Requested item">
          <input className={inputCls} value={item} onChange={(e) => setItem(e.target.value)} placeholder="Grilled cheese" list="request-items" autoComplete="off" />
          <datalist id="request-items">
            {["Grilled cheese", "PB&J", "Chef salad", "Ham sandwich", "Cheeseburger", "Veg salad", "Cottage cheese + fruit", "Cheese & cracker plate", "Smoothie"].map((x) => (
              <option key={x} value={x} />
            ))}
          </datalist>
        </Field>
        <div className="flex items-end gap-3">
          <Field label="Qty">
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setQuantity((q) => Math.max(1, q - 1))} aria-label="Less">
                −
              </Button>
              <span className="w-8 text-center text-xl font-bold" aria-live="polite">
                {quantity}
              </span>
              <Button variant="outline" onClick={() => setQuantity((q) => Math.min(99, q + 1))} aria-label="More">
                +
              </Button>
            </div>
          </Field>
        </div>
        <Field label="Prep notes (optional)" hint="Cook's note only — not a dietary order.">
          <input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="white bread, onion/relish/ketchup" />
        </Field>
        <Button type="submit" size="lg" className="w-full">
          Add request
        </Button>
      </form>
    </Sheet>
  );
}

export function PromptSheet({
  open,
  title,
  label,
  help,
  confirm,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  label: string;
  help?: string;
  confirm: string;
  onClose: () => void;
  onSubmit: (value: string) => boolean | void;
}) {
  const [value, setValue] = useState("");
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (onSubmit(value) !== false) {
            setValue("");
            onClose();
          }
        }}
      >
        {help && <p className="text-sm text-muted">{help}</p>}
        <Field label={label}>
          <input className={inputCls} value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off" />
        </Field>
        <Button type="submit" size="lg" className="w-full" disabled={!value.trim()}>
          {confirm}
        </Button>
      </form>
    </Sheet>
  );
}
