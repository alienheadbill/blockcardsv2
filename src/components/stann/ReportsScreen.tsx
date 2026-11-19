"use client";
import { useMemo, useState } from "react";
import * as C from "@/lib/counting";
import { addDays, formatShort } from "@/lib/dates";
import { MEAL_LABELS, MEAL_SERVICES, type MealService } from "@/lib/menu/types";
import { groupRequests } from "@/lib/requests";

import { useAppState } from "@/lib/state/store";
import { DateBar, useDateMeal } from "../DateMealBar";
import { useProfile } from "../useProfile";
import { Icon } from "../Icon";
import { AuditLog, BackupPanel } from "../Inventory";
import { act, Badge, Button, Card, csv, downloadFile, Empty, Field, inputCls } from "../ui";

export function ReportsScreen() {
  const { date, set } = useDateMeal();
  const d = useAppState((s) => s.workspaces.stann);
  const week = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(date, i - 6)), [date]);
  const profile = useProfile("stann");
  const meals = MEAL_SERVICES.filter((m) => profile.meals.includes(m));

  const exportCounts = () => {
    const rows: (string | number)[][] = [["Date", "Meal", "Status", "Choice / item", "Type", "Count"]];
    for (const s of Object.values(d.counts).sort((a, b) => a.date.localeCompare(b.date))) {
      const sum = C.summarize(s);
      for (const o of s.options) rows.push([s.date, MEAL_LABELS[s.meal], s.status, o.label, o.role, sum.byChoice[o.key] ?? 0]);
      for (const x of s.extras) rows.push([s.date, MEAL_LABELS[s.meal], s.status, x.label, "item", sum.items[x.key] ?? 0]);
      rows.push([s.date, MEAL_LABELS[s.meal], s.status, "TOTAL MEALS", "total", sum.totalMeals]);
    }
    downloadFile(`meal-counts-${date}.csv`, csv(rows), "text/csv");
  };

  return (
    <div className="space-y-4">
      <DateBar date={date} onChange={(x) => set({ date: x })} subtitle="Production report" />

      <Card title="Production for the day" action={<Button size="sm" variant="outline" onClick={() => window.print()} aria-label="Print"><Icon name="print" className="h-5 w-5" /></Button>}>
        <div className="space-y-4">
          {meals.map((m) => (
            <MealProduction key={m} date={date} meal={m} />
          ))}
        </div>
      </Card>

      <Card title="Last 7 days" action={<Button size="sm" variant="outline" onClick={exportCounts}>Export CSV</Button>}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted">
              <th className="py-1">Date</th>
              {meals.map((m) => (
                <th key={m} className="py-1 text-right">
                  {MEAL_LABELS[m]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {week.map((day) => (
              <tr key={day} className="border-t border-line">
                <td className="py-1.5 font-semibold">{formatShort(day)}</td>
                {meals.map((m) => {
                  const s = d.counts[C.sessionKey(day, m)];
                  return (
                    <td key={m} className="py-1.5 text-right tabular-nums">
                      {s ? (
                        <>
                          {C.summarize(s).totalMeals}
                          {s.status === "complete" ? " ✓" : " …"}
                        </>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-muted">✓ reviewed & complete · … still counting</p>
      </Card>

      <Settings />

      <Card title={<span className="flex items-center gap-2"><Icon name="lock" className="h-5 w-5" /> Facility mode</span>}>
        <p className="text-sm text-muted">
          This build runs in <strong>demo mode</strong>: fictional rooms only, data kept on this device. Facility mode (real residents, diet orders, multiple staff
          logins) is switched off until the facility approves the hosting, security model, access controls and any required business associate agreements. See{" "}
          <code>docs/SECURITY_CHECKLIST.md</code>.
        </p>
        <Badge tone="neutral">Disabled</Badge>
      </Card>

      <BackupPanel ws="stann" />
      <AuditLog ws="stann" />
    </div>
  );
}

function MealProduction({ date, meal }: { date: string; meal: MealService }) {
  const d = useAppState((s) => s.workspaces.stann);
  const session = d.counts[C.sessionKey(date, meal)];
  const groups = groupRequests(d.requests.filter((r) => r.date === date && r.meal === meal));
  const sum = session ? C.summarize(session) : null;
  return (
    <div className="rounded-xl border border-line p-3 print:break-inside-avoid">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="font-extrabold">{MEAL_LABELS[meal]}</h3>
        {session ? <Badge tone={session.status === "complete" ? "ok" : "warn"}>{session.status === "complete" ? "Complete" : "Not finished"}</Badge> : <Badge>Not counted</Badge>}
      </div>
      {!session && groups.length === 0 ? (
        <Empty>No count or requests.</Empty>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {session &&
              session.options
                .filter((o) => (sum!.byChoice[o.key] ?? 0) > 0)
                .map((o) => (
                  <tr key={o.key} className="border-b border-line">
                    <td className="py-1">{o.label}</td>
                    <td className="py-1 text-right font-bold tabular-nums">{sum!.byChoice[o.key]}</td>
                  </tr>
                ))}
            {session &&
              Object.entries(sum!.byUnit)
                .filter(([, v]) => v.total > 0)
                .map(([u, v]) => (
                  <tr key={`u-${u}`} className="border-b border-line text-muted">
                    <td className="py-1">{u || "No unit"}</td>
                    <td className="py-1 text-right tabular-nums">{v.total}</td>
                  </tr>
                ))}
            {session && (
              <tr className="border-b-2 border-ink font-extrabold">
                <td className="py-1">Resident meals</td>
                <td className="py-1 text-right tabular-nums">{sum!.totalMeals}</td>
              </tr>
            )}
            {session &&
              session.extras
                .filter((x) => (sum!.items[x.key] ?? 0) > 0)
                .map((x) => (
                  <tr key={x.key} className="border-b border-line text-muted">
                    <td className="py-1">+ {x.label}</td>
                    <td className="py-1 text-right tabular-nums">{sum!.items[x.key]}</td>
                  </tr>
                ))}
            {groups.map((g) => (
              <tr key={g.item} className="border-b border-line">
                <td className="py-1">Request: {g.item}</td>
                <td className="py-1 text-right font-bold tabular-nums">{g.totalQuantity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Settings() {
  const settings = useAppState((s) => s.workspaces.stann.settings);
  const save = (patch: Partial<typeof settings>) =>
    act((s) => ({ ...s, workspaces: { ...s.workspaces, stann: { ...s.workspaces.stann, settings: { ...s.workspaces.stann.settings, ...patch } } } }));
  return (
    <Card title="Kitchen settings">
      <div className="space-y-3">
        <Field label="Identify requests by">
          <select className={inputCls} value={settings.identifierType} onChange={(e) => save({ identifierType: e.target.value as "room" | "name" })}>
            <option value="room">Room number</option>
            <option value="name">Resident name (facility mode only)</option>
          </select>
        </Field>
        <div className="grid grid-cols-3 gap-2">
          {MEAL_SERVICES.map((m) => (
            <Field key={m} label={`${MEAL_LABELS[m]} serves`}>
              <input type="time" className={inputCls} value={settings.servingTimes[m]} onChange={(e) => e.target.value && save({ servingTimes: { ...settings.servingTimes, [m]: e.target.value } })} />
            </Field>
          ))}
        </div>
        <p className="text-sm text-muted">Which meals you see and what Counts opens on are set in your profile (tap your name at the top).</p>
        <UnitsField units={settings.units ?? []} onSave={(units) => save({ units })} />
        <Field label="Default counting mode">
          <select className={inputCls} value={settings.defaultCountMode} onChange={(e) => save({ defaultCountMode: e.target.value as "quick" | "detailed" })}>
            <option value="quick">Quick count — one tap per slip</option>
            <option value="detailed">Detailed — meal plus add-ons per slip</option>
          </select>
        </Field>
        <label className="flex items-center gap-3">
          <input type="checkbox" className="h-6 w-6" checked={settings.showTallyMarks} onChange={(e) => save({ showTallyMarks: e.target.checked })} />
          <span className="font-semibold">Show tally marks on count panels</span>
        </label>
        <label className="flex items-center gap-3">
          <input type="checkbox" className="h-6 w-6" checked={settings.requestDietCheck ?? false} onChange={(e) => save({ requestDietCheck: e.target.checked })} />
          <span className="font-semibold">Diet-check special requests (adds a “Diet checked” step)</span>
        </label>
        <label className="flex items-center gap-3">
          <input type="checkbox" className="h-6 w-6" checked={settings.hapticFeedback ?? true} onChange={(e) => save({ hapticFeedback: e.target.checked })} />
          <span className="font-semibold">Vibrate on each count tap (Android; iPhone doesn&apos;t allow it)</span>
        </label>
        <Field label="Ignore double taps on the same box" hint="Stops a bounced finger from counting one slip twice. Taps on different boxes are never blocked.">
          <select className={inputCls} value={settings.tapGuardMs ?? 300} onChange={(e) => save({ tapGuardMs: Number(e.target.value) })}>
            <option value={0}>Off</option>
            <option value={200}>Within 0.2 seconds</option>
            <option value={300}>Within 0.3 seconds (default)</option>
            <option value={500}>Within 0.5 seconds</option>
          </select>
        </Field>
        <Field label="Keep tap-by-tap logs of finished counts" hint="After this, old finished counts keep their totals, corrections and reasons, but not every single tap. Saves phone storage.">
          <select className={inputCls} value={settings.keepTapLogDays ?? 120} onChange={(e) => save({ keepTapLogDays: Number(e.target.value) })}>
            <option value={30}>30 days</option>
            <option value={60}>60 days</option>
            <option value={120}>120 days (default)</option>
            <option value={365}>1 year</option>
            <option value={0}>Forever (storage may fill up)</option>
          </select>
        </Field>
        <label className="flex items-center gap-3">
          <input type="checkbox" className="h-6 w-6" checked={settings.countMenuSides ?? false} onChange={(e) => save({ countMenuSides: e.target.checked })} />
          <span className="font-semibold">Also count menu sides, desserts &amp; fruit (off = entrées + modifications only)</span>
        </label>
      </div>
    </Card>
  );
}


function UnitsField({ units, onSave }: { units: string[]; onSave: (u: string[]) => boolean }) {
  const [text, setText] = useState(units.join(", "));
  const parsed = text
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  const changed = parsed.join("|") !== units.join("|");
  return (
    <Field label="Units (slip stacks)" hint="Comma separated. New counts tally each unit separately. Leave empty for one stack.">
      <div className="flex gap-2">
        <input className={inputCls} value={text} onChange={(e) => setText(e.target.value)} placeholder="Granite, Lilac, Birch" />
        <Button variant="outline" disabled={!changed} onClick={() => onSave([...new Set(parsed)])}>
          Save
        </Button>
      </div>
    </Field>
  );
}
