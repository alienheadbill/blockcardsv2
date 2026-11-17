"use client";
import { useMemo, useRef, useState } from "react";
import { exportFull, exportWorkspace, restore } from "@/lib/state/backup";
import type { InventoryItem } from "@/lib/state/model";
import * as ops from "@/lib/state/ops";
import { getState, lastReplace, replaceState, resetDemo, storageStats, undoLastReplace, useAppState } from "@/lib/state/store";
import { WORKSPACES, type WorkspaceId } from "@/lib/workspaces";
import { Icon } from "./Icon";
import { act, Badge, Banner, Button, Card, downloadFile, Empty, Field, inputCls, Sheet, toast } from "./ui";

export function InventoryList({ ws, title = "Inventory", showCost = false }: { ws: WorkspaceId; title?: string; showCost?: boolean }) {
  const items = useAppState((s) => s.workspaces[ws].inventory);
  const [editing, setEditing] = useState<InventoryItem | "new" | null>(null);
  const sorted = useMemo(() => [...items].sort((a, b) => Number(a.qty >= a.par) - Number(b.qty >= b.par) || a.name.localeCompare(b.name)), [items]);
  const low = ops.belowPar(items);
  return (
    <Card title={title} action={<Button size="sm" onClick={() => setEditing("new")}>+ Item</Button>}>
      {low.length > 0 && (
        <div className="mb-3 flex items-center justify-between gap-2 rounded-xl bg-warn-soft p-2 text-sm font-semibold text-warn">
          <span>{low.length} below par</span>
          <Button size="sm" variant="outline" onClick={() => act((s) => ops.restockFromInventory(s, ws), "Added to shopping list")}>
            Add to shopping list
          </Button>
        </div>
      )}
      {sorted.length === 0 ? (
        <Empty>Nothing tracked yet.</Empty>
      ) : (
        <ul className="divide-y divide-line">
          {sorted.map((i) => (
            <li key={i.id} className="flex items-center gap-2 py-2">
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEditing(i)} aria-label={`Edit ${i.name}`}>
                <span className="block font-semibold">{i.name}</span>
                <span className="text-sm text-muted">
                  par {i.par} {i.unit}
                  {showCost && i.unitCost != null && ` · $${i.unitCost.toFixed(2)}/${i.unit}`}
                </span>
              </button>
              {i.qty < i.par && <Badge tone="warn">low</Badge>}
              <div className="flex items-center gap-1">
                <Button size="sm" variant="outline" aria-label={`One less ${i.name}`} onClick={() => act((s) => ops.upsertInventory(s, ws, { ...i, qty: Math.max(0, i.qty - 1) }))}>
                  −
                </Button>
                <span className="w-14 text-center text-lg font-bold tabular-nums">
                  {i.qty}
                  <span className="block text-[10px] font-semibold text-muted">{i.unit}</span>
                </span>
                <Button size="sm" variant="outline" aria-label={`One more ${i.name}`} onClick={() => act((s) => ops.upsertInventory(s, ws, { ...i, qty: i.qty + 1 }))}>
                  +
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Sheet open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "New item" : "Edit item"}>
        {editing !== null && <InventoryForm key={editing === "new" ? "new" : editing.id} ws={ws} item={editing === "new" ? null : editing} showCost={showCost} onDone={() => setEditing(null)} />}
      </Sheet>
    </Card>
  );
}

function InventoryForm({ ws, item, showCost, onDone }: { ws: WorkspaceId; item: InventoryItem | null; showCost: boolean; onDone: () => void }) {
  const [name, setName] = useState(item?.name ?? "");
  const [qty, setQty] = useState(String(item?.qty ?? 0));
  const [unit, setUnit] = useState(item?.unit ?? "each");
  const [par, setPar] = useState(String(item?.par ?? 0));
  const [cost, setCost] = useState(item?.unitCost != null ? String(item.unitCost) : "");
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (
          act((s) =>
            ops.upsertInventory(s, ws, {
              ...(item ? { id: item.id } : {}),
              name,
              qty: Number(qty),
              unit: unit.trim() || "each",
              par: Number(par),
              unitCost: cost === "" ? null : Number(cost),
            }),
          )
        )
          onDone();
      }}
    >
      <Field label="Name">
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="grid grid-cols-3 gap-2">
        <Field label="On hand">
          <input className={inputCls} inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
        <Field label="Unit">
          <input className={inputCls} value={unit} onChange={(e) => setUnit(e.target.value)} />
        </Field>
        <Field label="Par">
          <input className={inputCls} inputMode="decimal" value={par} onChange={(e) => setPar(e.target.value)} />
        </Field>
      </div>
      {showCost && (
        <Field label="Cost per unit ($)">
          <input className={inputCls} inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} />
        </Field>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="lg" className="flex-1">
          Save
        </Button>
        {item && (
          <Button variant="danger" size="lg" onClick={() => window.confirm(`Delete ${item.name}?`) && act((s) => ops.deleteInventory(s, ws, item.id)) && onDone()}>
            Delete
          </Button>
        )}
      </div>
    </form>
  );
}

export function ShoppingList({ ws, title = "Shopping list" }: { ws: WorkspaceId; title?: string }) {
  const items = useAppState((s) => s.workspaces[ws].shopping);
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const open = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);
  return (
    <Card title={`${title} (${open.length})`}>
      <form
        className="mb-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (act((s) => ops.addShopping(s, ws, name, qty.trim()))) {
            setName("");
            setQty("");
          }
        }}
      >
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Add item" aria-label="Item" />
        <input className={`${inputCls} w-24`} value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Qty" aria-label="Quantity" />
        <Button type="submit" disabled={!name.trim()}>
          Add
        </Button>
      </form>
      {items.length === 0 ? (
        <Empty>List is empty.</Empty>
      ) : (
        <ul className="divide-y divide-line">
          {[...open, ...done].map((i) => (
            <li key={i.id}>
              <label className="flex min-h-12 items-center gap-3 py-1">
                <input type="checkbox" className="h-6 w-6" checked={i.done} onChange={() => act((s) => ops.toggleShopping(s, ws, i.id))} />
                <span className={`flex-1 text-base ${i.done ? "text-muted line-through" : "font-semibold"}`}>{i.name}</span>
                {i.qty && <span className="text-sm text-muted">{i.qty}</span>}
                {i.source !== "manual" && <Badge>{i.source === "inventory" ? "restock" : "plan"}</Badge>}
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    act((s) => ops.deleteShopping(s, ws, i.id));
                  }}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-danger"
                  aria-label={`Delete ${i.name}`}
                >
                  <Icon name="trash" className="h-5 w-5" />
                </button>
              </label>
            </li>
          ))}
        </ul>
      )}
      {items.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {done.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => act((s) => ops.clearDoneShopping(s, ws))}>
              Delete {done.length} checked
            </Button>
          )}
          <Button size="sm" variant="ghost" className="text-danger" onClick={() => window.confirm("Delete everything on this list?") && act((s) => ops.clearAllShopping(s, ws))}>
            Delete all
          </Button>
        </div>
      )}
    </Card>
  );
}

export function AuditLog({ ws }: { ws: WorkspaceId }) {
  const audit = useAppState((s) => s.workspaces[ws].audit);
  const [all, setAll] = useState(false);
  const shown = all ? audit : audit.slice(0, 15);
  return (
    <Card title="Activity log">
      {audit.length === 0 ? (
        <Empty>No activity yet.</Empty>
      ) : (
        <ol className="space-y-1 text-sm">
          {shown.map((a) => (
            <li key={a.id} className="flex gap-2 border-b border-line py-1">
              <time className="w-28 shrink-0 text-muted">{new Date(a.at).toLocaleString([], { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })}</time>
              <span className="min-w-0">
                <span className="font-semibold">{a.action}</span> — {a.detail}
              </span>
            </li>
          ))}
        </ol>
      )}
      {audit.length > 15 && (
        <Button size="sm" variant="ghost" className="mt-2" onClick={() => setAll((v) => !v)}>
          {all ? "Show fewer" : `Show all ${audit.length}`}
        </Button>
      )}
    </Card>
  );
}

export function BackupPanel({ ws }: { ws: WorkspaceId }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [undoInfo, setUndoInfo] = useState(() => lastReplace());
  const [stats] = useState(() => storageStats());
  const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  const onFile = async (file: File) => {
    setError(null);
    if (file.size > 20 * 1024 * 1024) return setError("That file is too large to be a Kitchen Blockcards backup.");
    const text = await file.text();
    const res = restore(getState(), text, ws);
    if (!res.ok) return setError(res.error);
    if (!window.confirm(`${res.summary.replace("Restored", "Replace")} with the backup? Current data in that scope will be overwritten.`)) return;
    replaceState(res.state, "restore");
    toast(res.summary);
    setUndoInfo(lastReplace());
  };
  return (
    <Card title="Backup & restore">
      <p className="mb-3 text-sm text-muted">
        Demo data is stored only on this phone and is <strong>not</strong> shared with other devices. Download a backup to keep a copy or move it to another phone.
      </p>
      <div className="mb-3">
        <div className="flex justify-between text-xs font-semibold text-muted">
          <span>Storage used on this phone</span>
          <span>
            {(stats.bytes / 1024 / 1024).toFixed(2)} MB of about 5 MB ({stats.pct}%)
          </span>
        </div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label="Storage used" aria-valuenow={stats.pct} aria-valuemin={0} aria-valuemax={100}>
          <div className={`h-full ${stats.pct >= 70 ? "bg-danger" : "bg-ok"}`} style={{ width: `${Math.min(100, stats.pct)}%` }} />
        </div>
        {stats.pct >= 70 && (
          <div className="mt-2">
            <Banner tone="warn">Storage is getting full. Download a backup, then lower “keep tap-by-tap logs” in Kitchen settings so old counts are slimmed down.</Banner>
          </div>
        )}
      </div>
      {undoInfo && (
        <div className="mb-3 flex items-center justify-between gap-2 rounded-xl bg-surface-2 p-2 text-sm">
          <span>
            Last {undoInfo.label} at {new Date(undoInfo.at).toLocaleString([], { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" })}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (window.confirm(`Put back the data from before the ${undoInfo.label}?`) && undoLastReplace()) {
                toast(`Undid the ${undoInfo.label}`);
                setUndoInfo(null);
              }
            }}
          >
            Undo {undoInfo.label}
          </Button>
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <Button variant="outline" onClick={() => downloadFile(`blockcards-${ws}-${stamp()}.json`, JSON.stringify(exportWorkspace(getState(), ws), null, 2))}>
          Download {WORKSPACES[ws].name}
        </Button>
        <Button variant="outline" onClick={() => downloadFile(`blockcards-all-${stamp()}.json`, JSON.stringify(exportFull(getState()), null, 2))}>
          Download all workspaces
        </Button>
        <Button variant="outline" onClick={() => fileRef.current?.click()}>
          Restore from file…
        </Button>
        <Button
          variant="ghost"
          className="text-danger"
          onClick={() => {
            if (window.confirm("Erase ALL demo data on this device and start over? Download a backup first if you need it.")) {
              resetDemo();
              toast("Demo data reset");
              setUndoInfo(lastReplace());
            }
          }}
        >
          Reset demo data
        </Button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        data-testid="restore-input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
          e.target.value = "";
        }}
      />
      {error && (
        <div className="mt-3">
          <Banner tone="danger">{error}</Banner>
        </div>
      )}
    </Card>
  );
}
