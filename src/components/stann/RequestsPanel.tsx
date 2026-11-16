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
  const standing = useAppState((s) => s.workspaces.stann.standingRequests ?? []);
  const units = useAppState((s) => s.workspaces.stann.settings.units ?? []);
  const pending = useMemo(() => R.pendingStanding(standing, all, date, meal), [standing, all, date, meal]);
  const regulars = useMemo(() => standing.filter((x) => x.meal === meal), [standing, meal]);
  const [adding, setAdding] = useState(false);
  const [showRegulars, setShowRegulars] = useState(false);
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
      {pending.length > 0 && (
        <div className="mb-3 rounded-xl border-2 border-dashed border-accent bg-accent-soft/50 p-3">
          <p className="text-sm font-bold">Daily regulars not added yet</p>
          <ul className="mt-1 text-sm">
            {pending.map((p) => (
              <li key={p.id}>
                {p.item}
                {p.quantity > 1 ? ` ×${p.quantity}` : ""} — {p.identifier}
                {p.unit ? ` (${p.unit})` : ""}
              </li>
            ))}
          </ul>
          <Button size="sm" className="mt-2" onClick={() => act((s) => ops.addStandingForService(s, date, meal, countSessionId), "Daily regulars added")}>
            Add {pending.length} for today
          </Button>
        </div>
      )}
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
                      <span className="font-semibold text-muted">
                        {" "}
                        — {r.identifier}
                        {r.unit ? ` · ${r.unit}` : ""}
                      </span>
                    </p>
                    {r.notes && <p className="text-sm text-muted">Note: {r.notes}</p>}
                    <div className="mt-1 flex flex-wrap gap-1">
                      <Badge tone={r.verification === "verified" ? "ok" : r.verification === "flagged" ? "danger" : "warn"}>
                        {R.VERIFICATION_LABELS[r.verification]}
                        {r.verifiedBy ? ` (${r.verifiedBy})` : ""}
                      </Badge>
                      <Badge tone={STATUS_TONE[r.status]}>{R.STATUS_LABELS[r.status]}</Badge>
                      {r.standingId && <Badge>daily</Badge>}
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
                    {r.verification !== "verified" ? (
                      <Button size="sm" variant="outline" onClick={() => act((s) => ops.updateRequest(s, r.id, (x) => R.markVerified(x), "request.verify"))}>
                        ✓ Diet checked
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => act((s) => ops.updateRequest(s, r.id, R.unmarkVerified, "request.unverify"))}>
                        Uncheck
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

      {regulars.length > 0 && (
        <div className="mt-3">
          <button type="button" className="text-sm font-semibold text-primary underline" onClick={() => setShowRegulars((v) => !v)} aria-expanded={showRegulars}>
            {showRegulars ? "Hide" : "Manage"} daily regulars ({regulars.filter((x) => x.active).length})
          </button>
          {showRegulars && (
            <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
              {regulars.map((x) => (
                <li key={x.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className={`flex-1 ${x.active ? "" : "text-muted line-through"}`}>
                    {x.item} — {x.identifier}
                    {x.unit ? ` · ${x.unit}` : ""}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => act((s) => ops.setStandingActive(s, x.id, !x.active))}>
                    {x.active ? "Stop" : "Resume"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <AddRequestSheet open={adding} onClose={() => setAdding(false)} date={date} meal={meal} idType={idType} units={units} countSessionId={countSessionId} />
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
  units,
  countSessionId,
}: {
  open: boolean;
  onClose: () => void;
  date: ISODate;
  meal: MealService;
  idType: "room" | "name";
  units: string[];
  countSessionId?: string;
}) {
  const [room, setRoom] = useState("");
  const [side, setSide] = useState<"L" | "R" | "">("");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [item, setItem] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");
  const [daily, setDaily] = useState(false);
  const identifier = idType === "room" ? R.formatRoom(room, side) : name.trim();
  const submit = () => {
    const base = { meal, identifier, item, quantity, notes, ...(unit ? { unit } : {}) };
    const ok = act((s) => {
      let next = s;
      if (daily) {
        next = ops.addStandingRequest(next, base);
        return ops.addStandingForService(next, date, meal, countSessionId);
      }
      return ops.addRequest(next, { ...base, date, ...(countSessionId ? { countSessionId } : {}) });
    }, daily ? "Daily regular saved and added for today" : "Request added");
    if (ok) {
      setRoom("");
      setSide("");
      setName("");
      setItem("");
      setQuantity(1);
      setNotes("");
      setDaily(false);
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
        {idType === "room" ? (
          <div className="flex items-end gap-2">
            <Field label="Room">
              <input className={inputCls} value={room} onChange={(e) => setRoom(e.target.value)} placeholder="Demo 207" autoComplete="off" inputMode="text" />
            </Field>
            <div role="radiogroup" aria-label="Side of room" className="grid shrink-0 grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
              {(["L", "R"] as const).map((x) => (
                <button
                  key={x}
                  type="button"
                  role="radio"
                  aria-checked={side === x}
                  aria-label={x === "L" ? "Left side" : "Right side"}
                  onClick={() => setSide(side === x ? "" : x)}
                  className={`h-10 w-12 rounded-lg text-lg font-extrabold ${side === x ? "bg-primary text-primary-ink" : "text-muted"}`}
                >
                  {x}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <Field label="Resident name">
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
          </Field>
        )}
        {units.length > 0 && (
          <Field label="Unit (optional)">
            <div className="grid gap-1 rounded-xl bg-surface-2 p-1" style={{ gridTemplateColumns: `repeat(${units.length}, minmax(0, 1fr))` }} role="radiogroup" aria-label="Unit">
              {units.map((u) => (
                <button
                  key={u}
                  type="button"
                  role="radio"
                  aria-checked={unit === u}
                  onClick={() => setUnit(unit === u ? "" : u)}
                  className={`min-h-10 rounded-lg text-sm font-bold ${unit === u ? "bg-primary text-primary-ink" : "text-muted"}`}
                >
                  {u}
                </button>
              ))}
            </div>
          </Field>
        )}
        <Field label="Requested item">
          <input className={inputCls} value={item} onChange={(e) => setItem(e.target.value)} placeholder="Grilled cheese" list="request-items" autoComplete="off" />
          <datalist id="request-items">
            {["Grilled cheese", "PB&J", "Chef salad", "Ham sandwich", "Cheeseburger", "Veg salad", "Cottage cheese + fruit", "Cheese & cracker plate", "Smoothie"].map((x) => (
              <option key={x} value={x} />
            ))}
          </datalist>
        </Field>
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
        <Field label="Prep notes (optional)" hint="Cook's note only — not a dietary order.">
          <input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="white bread, onion/relish/ketchup" />
        </Field>
        <label className="flex items-start gap-3 rounded-xl border border-line p-3">
          <input type="checkbox" className="mt-0.5 h-6 w-6" checked={daily} onChange={(e) => setDaily(e.target.checked)} />
          <span className="text-sm">
            <strong>Repeat every day</strong> at {MEAL_LABELS[meal].toLowerCase()} — for someone who gets the same thing daily. You can stop it any time.
          </span>
        </label>
        <Button type="submit" size="lg" className="w-full" disabled={!identifier || !item.trim()}>
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
  initial = "",
  extra,
}: {
  open: boolean;
  title: string;
  label: string;
  help?: string;
  confirm: string;
  onClose: () => void;
  onSubmit: (value: string) => boolean | void;
  initial?: string;
  extra?: React.ReactNode;
}) {
  const [value, setValue] = useState(initial);
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
        {extra}
      </form>
    </Sheet>
  );
}
