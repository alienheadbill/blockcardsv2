"use client";
import { useMemo, useState } from "react";
import type { TicketStatus, TruckMenuItem } from "@/lib/state/model";
import * as ops from "@/lib/state/ops";
import { useAppState } from "@/lib/state/store";
import { DateBar, useDateMeal } from "../DateMealBar";
import { AuditLog, BackupPanel, InventoryList, ShoppingList } from "../Inventory";
import { PrepBoard } from "../PrepBoard";
import { act, Badge, Button, Card, csv, downloadFile, Empty, Field, inputCls, Sheet } from "../ui";

const money = (n: number) => `$${n.toFixed(2)}`;
const NEXT: Partial<Record<TicketStatus, TicketStatus>> = { open: "preparing", preparing: "ready", ready: "served" };
const STATUS_LABEL: Record<TicketStatus, string> = { open: "New", preparing: "Cooking", ready: "Ready", served: "Picked up", cancelled: "Cancelled" };

export function OrdersScreen() {
  const { date, set } = useDateMeal();
  const d = useAppState((s) => s.workspaces.truck);
  const state = useAppState((s) => s);
  const summary = useMemo(() => ops.truckDaySummary(state, date), [state, date]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");
  const tickets = d.tickets.filter((t) => t.date === date);
  const active = tickets.filter((t) => t.status === "open" || t.status === "preparing" || t.status === "ready");
  const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);
  const cartTotal = Object.entries(cart).reduce((n, [id, q]) => n + q * (d.menu.find((m) => m.id === id)?.price ?? 0), 0);

  return (
    <div className="space-y-3">
      <DateBar date={date} onChange={(x) => set({ date: x })} subtitle="Service day" />
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Tickets" value={summary.tickets} />
        <Stat label="Open" value={summary.open} />
        <Stat label="Sales" value={money(summary.revenue)} />
      </div>

      <Card title="New ticket">
        <div className="grid grid-cols-2 gap-2">
          {d.menu
            .filter((m) => m.active)
            .map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setCart((c) => ({ ...c, [m.id]: (c[m.id] ?? 0) + 1 }))}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setCart((c) => ({ ...c, [m.id]: Math.max(0, (c[m.id] ?? 0) - 1) }));
                }}
                className="flex min-h-20 flex-col justify-between rounded-xl border-2 border-line bg-surface p-3 text-left active:scale-[0.97]"
                aria-label={`Add ${m.name}. In ticket: ${cart[m.id] ?? 0}`}
              >
                <span className="font-bold leading-tight">{m.name}</span>
                <span className="flex items-end justify-between">
                  <span className="text-sm text-muted">{money(m.price)}</span>
                  {cart[m.id] ? <span className="rounded-lg bg-accent px-2 text-xl font-extrabold text-accent-ink">{cart[m.id]}</span> : null}
                </span>
              </button>
            ))}
        </div>
        <input className={`${inputCls} mt-2`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ticket note (no onions…)" aria-label="Ticket note" />
        <div className="mt-2 flex gap-2">
          <Button variant="outline" disabled={!cartCount} onClick={() => setCart({})}>
            Clear
          </Button>
          <Button
            variant="accent"
            size="lg"
            className="flex-1"
            disabled={!cartCount}
            onClick={() => {
              if (act((s) => ops.addTicket(s, date, Object.entries(cart).map(([menuItemId, qty]) => ({ menuItemId, qty })), note), "Ticket sent to the line")) {
                setCart({});
                setNote("");
              }
            }}
          >
            Send · {cartCount} · {money(cartTotal)}
          </Button>
        </div>
      </Card>

      <Card title={`On the line (${active.length})`}>
        {active.length === 0 ? (
          <Empty>No open tickets.</Empty>
        ) : (
          <ul className="space-y-2">
            {active.map((t) => (
              <li key={t.id} className={`rounded-xl border-2 p-3 ${t.status === "ready" ? "border-ok bg-ok-soft" : "border-line"}`}>
                <div className="flex items-center justify-between">
                  <span className="text-xl font-extrabold">#{t.number}</span>
                  <Badge tone={t.status === "ready" ? "ok" : t.status === "preparing" ? "accent" : "neutral"}>{STATUS_LABEL[t.status]}</Badge>
                </div>
                <ul className="mt-1 text-base">
                  {t.lines.map((l) => (
                    <li key={l.menuItemId}>
                      <strong>{l.qty}×</strong> {d.menu.find((m) => m.id === l.menuItemId)?.name ?? "(removed item)"}
                    </li>
                  ))}
                </ul>
                {t.note && <p className="text-sm text-muted">Note: {t.note}</p>}
                <div className="mt-2 flex gap-2">
                  {NEXT[t.status] && (
                    <Button className="flex-1" onClick={() => act((s) => ops.setTicketStatus(s, t.id, NEXT[t.status]!))}>
                      → {STATUS_LABEL[NEXT[t.status]!]}
                    </Button>
                  )}
                  <Button variant="ghost" onClick={() => window.confirm(`Cancel ticket #${t.number}?`) && act((s) => ops.setTicketStatus(s, t.id, "cancelled"))}>
                    Cancel
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Item counts today">
        {summary.rows.length === 0 ? (
          <Empty>No orders yet.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {summary.rows.map((r) => (
              <li key={r.name} className="flex justify-between py-1.5 text-base">
                <span>{r.name}</span>
                <span className="font-extrabold tabular-nums">{r.qty}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-primary p-2 text-primary-ink">
      <div className="text-2xl font-extrabold tabular-nums">{value}</div>
      <div className="text-xs font-semibold uppercase opacity-90">{label}</div>
    </div>
  );
}

export function TruckPrep() {
  const { date, set } = useDateMeal();
  return (
    <div className="space-y-3">
      <DateBar date={date} onChange={(x) => set({ date: x })} subtitle="Prep list starts here" />
      <TruckForecast />
      <PrepBoard ws="truck" baseDate={date} withMeals={false} />
    </div>
  );
}

/** Prep forecast: average units per item over the last service days. */
function TruckForecast() {
  const d = useAppState((s) => s.workspaces.truck);
  const rows = useMemo(() => {
    const byDate = new Map<string, Map<string, number>>();
    for (const t of d.tickets) {
      if (t.status === "cancelled") continue;
      const m = byDate.get(t.date) ?? new Map<string, number>();
      for (const l of t.lines) m.set(l.menuItemId, (m.get(l.menuItemId) ?? 0) + l.qty);
      byDate.set(t.date, m);
    }
    const days = [...byDate.keys()].sort().slice(-5);
    if (!days.length) return [];
    return d.menu
      .filter((m) => m.active)
      .map((m) => ({ name: m.name, avg: days.reduce((n, day) => n + (byDate.get(day)?.get(m.id) ?? 0), 0) / days.length, days: days.length }));
  }, [d.tickets, d.menu]);
  if (!rows.length) return null;
  return (
    <Card title="Prep forecast">
      <p className="mb-2 text-xs text-muted">Average sold per service day over the last {rows[0]!.days} day(s) with orders. Adjust for weather and events.</p>
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.name} className="flex justify-between py-1">
            <span>{r.name}</span>
            <span className="font-bold tabular-nums">~{Math.ceil(r.avg)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function TruckMenuScreen() {
  const d = useAppState((s) => s.workspaces.truck);
  const [editing, setEditing] = useState<TruckMenuItem | "new" | null>(null);
  return (
    <Card title="Truck menu" action={<Button size="sm" onClick={() => setEditing("new")}>+ Item</Button>}>
      <ul className="divide-y divide-line">
        {d.menu.map((m) => {
          const r = m.recipeId ? d.recipes.find((x) => x.id === m.recipeId) : undefined;
          const cost = r?.costPerBatch != null ? r.costPerBatch / r.yieldPortions : null;
          return (
            <li key={m.id}>
              <button type="button" className="flex w-full items-center gap-2 py-2 text-left" onClick={() => setEditing(m)}>
                <span className="min-w-0 flex-1">
                  <span className={`block font-bold ${m.active ? "" : "text-muted line-through"}`}>{m.name}</span>
                  <span className="text-sm text-muted">
                    {r ? `Recipe: ${r.name}` : "No recipe linked"}
                    {cost !== null && ` · cost ${money(cost)} · ${Math.round((cost / (m.price || 1)) * 100)}% food cost`}
                  </span>
                </span>
                <span className="text-lg font-extrabold">{money(m.price)}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "New menu item" : "Edit menu item"}>
        {editing !== null && <TruckItemForm key={editing === "new" ? "new" : editing.id} item={editing === "new" ? null : editing} onDone={() => setEditing(null)} />}
      </Sheet>
    </Card>
  );
}

function TruckItemForm({ item, onDone }: { item: TruckMenuItem | null; onDone: () => void }) {
  const recipes = useAppState((s) => s.workspaces.truck.recipes);
  const [name, setName] = useState(item?.name ?? "");
  const [price, setPrice] = useState(item ? String(item.price) : "");
  const [recipeId, setRecipeId] = useState(item?.recipeId ?? "");
  const [active, setActive] = useState(item?.active ?? true);
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (act((s) => ops.saveTruckMenuItem(s, { ...(item ? { id: item.id } : {}), name, price: Number(price), active, ...(recipeId ? { recipeId } : {}) }))) onDone();
      }}
    >
      <Field label="Name">
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Price ($)">
        <input className={inputCls} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
      </Field>
      <Field label="Recipe (for food cost)">
        <select className={inputCls} value={recipeId} onChange={(e) => setRecipeId(e.target.value)}>
          <option value="">None</option>
          {recipes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </Field>
      <label className="flex items-center gap-3">
        <input type="checkbox" className="h-6 w-6" checked={active} onChange={(e) => setActive(e.target.checked)} />
        <span className="font-semibold">On the menu today</span>
      </label>
      <Button type="submit" size="lg" className="w-full">
        Save
      </Button>
    </form>
  );
}

export function TruckInventoryScreen() {
  return (
    <div className="space-y-3">
      <InventoryList ws="truck" title="Truck stock" showCost />
      <ShoppingList ws="truck" title="Restock list" />
    </div>
  );
}

export function TruckReports() {
  const { date, set } = useDateMeal();
  const state = useAppState((s) => s);
  const sum = useMemo(() => ops.truckDaySummary(state, date), [state, date]);
  const cost = sum.rows.reduce((n, r) => n + (r.cost ?? 0), 0);
  const costKnown = sum.rows.every((r) => r.cost !== null);
  return (
    <div className="space-y-3">
      <DateBar date={date} onChange={(x) => set({ date: x })} subtitle="Daily sales" />
      <Card
        title="Daily sales summary"
        action={
          <Button
            size="sm"
            variant="outline"
            disabled={!sum.rows.length}
            onClick={() => downloadFile(`stop-n-chop-${date}.csv`, csv([["Item", "Qty", "Revenue", "Food cost"], ...sum.rows.map((r) => [r.name, r.qty, r.revenue.toFixed(2), r.cost?.toFixed(2) ?? ""])]), "text/csv")}
          >
            Export CSV
          </Button>
        }
      >
        {sum.rows.length === 0 ? (
          <Empty>No sales on this day.</Empty>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted">
                <th>Item</th>
                <th className="text-right">Qty</th>
                <th className="text-right">Sales</th>
                <th className="text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {sum.rows.map((r) => (
                <tr key={r.name} className="border-t border-line">
                  <td className="py-1.5">{r.name}</td>
                  <td className="py-1.5 text-right tabular-nums">{r.qty}</td>
                  <td className="py-1.5 text-right tabular-nums">{money(r.revenue)}</td>
                  <td className="py-1.5 text-right tabular-nums">{r.cost !== null ? money(r.cost) : "—"}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-ink font-extrabold">
                <td className="py-1.5">Total · {sum.tickets} tickets</td>
                <td className="py-1.5 text-right tabular-nums">{sum.items}</td>
                <td className="py-1.5 text-right tabular-nums">{money(sum.revenue)}</td>
                <td className="py-1.5 text-right tabular-nums">{costKnown ? money(cost) : `${money(cost)}+`}</td>
              </tr>
            </tbody>
          </table>
        )}
        {!costKnown && sum.rows.length > 0 && <p className="mt-2 text-xs text-muted">Link recipes with batch costs to menu items to see full food cost.</p>}
      </Card>
      <BackupPanel ws="truck" />
      <AuditLog ws="truck" />
    </div>
  );
}

