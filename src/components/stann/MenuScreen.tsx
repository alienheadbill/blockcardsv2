"use client";
import { useMemo, useState } from "react";
import { addDays, dayOfWeek, DAY_NAMES, formatLong, isISODate, localToday, type ISODate } from "@/lib/dates";
import { SEASONS } from "@/lib/menu/fallWinter";
import { applyCorrections, flaggedItems, rotationPosition } from "@/lib/menu/rotation";
import { KIND_LABELS, MEAL_LABELS, MEAL_SERVICES, MENU_ITEM_KINDS, type MealService, type MenuItem, type MenuItemKind } from "@/lib/menu/types";
import * as ops from "@/lib/state/ops";
import { useAppState } from "@/lib/state/store";
import { DateBar, useDateMeal } from "../DateMealBar";
import { Icon } from "../Icon";
import { MenuList, positionLabel } from "../MenuList";
import { useProfile } from "../useProfile";
import { act, Badge, Banner, Button, Card, csv, downloadFile, Field, inputCls, Sheet } from "../ui";

export function MenuScreen() {
  const { date, set } = useDateMeal();
  const state = useAppState((s) => s);
  const d = state.workspaces.stann;
  const season = ops.seasonFor(state);
  const [overrideFor, setOverrideFor] = useState<MealService | null>(null);
  const [editItem, setEditItem] = useState<MenuItem | null>(null);
  const todayPos = d.rotation.week1Start ? rotationPosition(date, d.rotation, season.cycleWeeks) : null;
  const [week, setWeek] = useState<number>(todayPos?.week ?? 1);
  const flagged = useMemo(() => flaggedItems(season, d.corrections), [season, d.corrections]);
  const days = useMemo(() => [0, 1, 2].map((i) => addDays(date, i)), [date]);
  const profile = useProfile("stann");
  const [allMeals, setAllMeals] = useState(false);
  const shownMeals = allMeals ? MEAL_SERVICES : MEAL_SERVICES.filter((m) => profile.meals.includes(m));
  const hiddenMeals = MEAL_SERVICES.length - profile.meals.length;

  const exportCsv = () => {
    const rows: (string | number)[][] = [["Season", "Week", "Day", "Meal", "Type", "Printed label", "Item", "Review note"]];
    for (const w of season.weeks)
      w.days.forEach((day, di) =>
        MEAL_SERVICES.forEach((m) => applyCorrections(day[m], d.corrections).forEach((i) => rows.push([season.name, w.week, DAY_NAMES[di]!, MEAL_LABELS[m], KIND_LABELS[i.kind], i.printedLabel, i.text, i.flag ?? ""]))),
      );
    downloadFile(`menu-${season.id}.csv`, csv(rows), "text/csv");
  };

  return (
    <div className="space-y-4">
      <div className="no-print space-y-3">
        <DateBar date={date} onChange={(x) => set({ date: x })} subtitle={todayPos ? `Week ${todayPos.week} · ${todayPos.dayName}` : "Rotation not set"} />

        {hiddenMeals > 0 && (
          <button type="button" className="text-sm font-semibold text-primary underline" onClick={() => setAllMeals((v) => !v)}>
            {allMeals ? `Show only ${profile.name.toLowerCase()} meals` : "Show all meals"}
          </button>
        )}
        {days.map((day, i) => (
          <Card key={day} title={<span>{i === 0 ? "Selected day" : i === 1 ? "Next day" : "Two days ahead"} <span className="text-sm font-semibold text-muted">· {formatLong(day)}</span></span>}>
            <p className="-mt-2 mb-2 text-sm font-semibold text-muted">{positionLabel(ops.mealFor(state, day, "breakfast"))}</p>
            <div className="space-y-3">
              {shownMeals.map((m) => {
                const r = ops.mealFor(state, day, m);
                return (
                  <div key={m} className="rounded-xl border border-line p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h3 className="font-extrabold">{MEAL_LABELS[m]}</h3>
                      {i === 0 && (
                        <div className="flex gap-1">
                          {r.source === "override" ? (
                            <Button size="sm" variant="ghost" onClick={() => act((s) => ops.clearOverride(s, day, m), "Back to the rotation menu")}>
                              Undo change
                            </Button>
                          ) : null}
                          <Button size="sm" variant="outline" onClick={() => setOverrideFor(m)}>
                            Change for this date
                          </Button>
                        </div>
                      )}
                    </div>
                    {r.source === "override" && (
                      <p className="mb-1 text-sm font-semibold text-warn">
                        Changed for this date only — {r.overrideReason}
                      </p>
                    )}
                    {r.items.length ? <MenuList items={r.items} compact={i > 0} /> : <p className="text-sm text-muted">No menu — set the rotation below.</p>}
                  </div>
                );
              })}
            </div>
          </Card>
        ))}

        <RotationSettings />

        {flagged.length > 0 && (
          <Card title={<span className="text-warn">⚠ Transcription review ({flagged.length})</span>}>
            <p className="mb-2 text-sm text-muted">These lines were hard to read on the photos or look unusual. Compare each with the posted sheet, fix it if needed, and mark it reviewed.</p>
            <ul className="space-y-2">
              {flagged.map((f) => (
                <li key={f.item.id} className="rounded-xl bg-warn-soft p-2 text-sm">
                  <p className="font-bold">
                    Week {f.week} · {DAY_NAMES[f.dayIndex]} · {MEAL_LABELS[f.meal]}
                  </p>
                  <p>{f.item.text}</p>
                  <p className="text-warn">{f.item.flag}</p>
                  <Button size="sm" variant="outline" className="mt-1" onClick={() => setEditItem(f.item)}>
                    Review
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      <Card
        title={`${season.name} rotation`}
        action={
          <div className="no-print flex gap-1">
            <Button size="sm" variant="outline" onClick={() => window.print()} aria-label="Print week">
              <Icon name="print" className="h-5 w-5" />
            </Button>
            <Button size="sm" variant="outline" onClick={exportCsv} aria-label="Download menu CSV">
              <Icon name="download" className="h-5 w-5" />
            </Button>
          </div>
        }
      >
        <div role="tablist" aria-label="Rotation week" className="no-print mb-3 grid grid-cols-4 gap-1 rounded-xl bg-surface-2 p-1">
          {season.weeks.map((w) => (
            <button key={w.week} role="tab" aria-selected={week === w.week} type="button" onClick={() => setWeek(w.week)} className={`min-h-11 rounded-lg font-bold ${week === w.week ? "bg-primary text-primary-ink" : "text-muted"}`}>
              Week {w.week}
            </button>
          ))}
        </div>
        <WeekView week={week} onEdit={setEditItem} />
      </Card>

      <History />

      <OverrideSheet date={date} meal={overrideFor} onClose={() => setOverrideFor(null)} />
      <CorrectionSheet item={editItem} onClose={() => setEditItem(null)} />
    </div>
  );
}

function WeekView({ week, onEdit }: { week: number; onEdit: (i: MenuItem) => void }) {
  const state = useAppState((s) => s);
  const season = ops.seasonFor(state);
  const corrections = state.workspaces.stann.corrections;
  const w = season.weeks.find((x) => x.week === week)!;
  return (
    <div>
      <h3 className="mb-2 hidden text-xl font-bold print:block">
        {season.name} — Week {week}
      </h3>
      {w.flag && (
        <div className="no-print mb-2">
          <Banner tone="info">{w.flag}</Banner>
        </div>
      )}
      <p className="no-print mb-2 text-xs text-muted">Source: {w.source}</p>
      <div className="space-y-2">
        {w.days.map((day, di) => (
          <details key={di} className="rounded-xl border border-line print:break-inside-avoid" open={false}>
            <summary className="flex min-h-12 cursor-pointer items-center px-3 font-extrabold">{DAY_NAMES[di]}</summary>
            <div className="space-y-3 border-t border-line p-3">
              {MEAL_SERVICES.map((m) => (
                <div key={m}>
                  <p className="mb-1 text-sm font-bold text-muted">{MEAL_LABELS[m]}</p>
                  <MenuList items={applyCorrections(day[m], corrections)} compact onEdit={onEdit} />
                </div>
              ))}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

function RotationSettings() {
  const d = useAppState((s) => s.workspaces.stann);
  const [start, setStart] = useState(d.rotation.week1Start ?? "");
  const [confirmed, setConfirmed] = useState(d.rotation.confirmed);
  const [note, setNote] = useState(d.rotation.note);
  const isSunday = isISODate(start) && dayOfWeek(start) === 0;
  const preview = isSunday ? rotationPosition(localToday(), { week1Start: start }, 4) : null;
  return (
    <section id="rotation" className="scroll-mt-20">
      <Card title="Rotation start date">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            act((s) => ops.setRotationAnchor(s, start, confirmed, note), "Rotation saved");
          }}
        >
          <Field label="Season">
            <select className={inputCls} value={d.rotation.seasonId} disabled>
              {SEASONS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <p className="-mt-2 text-xs text-muted">Spring/Summer menus haven&apos;t been supplied yet — photograph the sheets to add them.</p>
          <Field label="Week 1 starts on (a Sunday)" hint="Use the date the facility confirms as Week 1 Sunday. The app never guesses this from the calendar.">
            <input type="date" className={inputCls} value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          {start && !isSunday && <Banner tone="danger">That date is a {isISODate(start) ? DAY_NAMES[dayOfWeek(start)] : "invalid date"} — Week 1 must start on a Sunday.</Banner>}
          {preview && (
            <p className="text-sm font-semibold">
              With this date, today is <Badge tone="accent">Week {preview.week} · {preview.dayName}</Badge>
            </p>
          )}
          <Field label="Where this date came from">
            <textarea className={`${inputCls} min-h-20 py-2`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Confirmed with dietary manager on …" />
          </Field>
          <label className="flex items-start gap-3 rounded-xl border border-line p-3">
            <input type="checkbox" className="mt-0.5 h-6 w-6" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            <span className="text-sm font-semibold">I confirmed this start date against the facility&apos;s posted rotation.</span>
          </label>
          <Button type="submit" className="w-full" disabled={!isSunday}>
            Save rotation
          </Button>
        </form>
      </Card>
    </section>
  );
}

function History() {
  const history = useAppState((s) => s.workspaces.stann.menuHistory);
  if (!history.length) return null;
  return (
    <Card title="Menu edit history" >
      <ul className="space-y-2 text-sm">
        {history.slice(0, 30).map((h) => (
          <li key={h.id} className="border-b border-line pb-1">
            <span className="text-muted">{new Date(h.at).toLocaleString()}</span> — “{h.before.text}” → <strong>“{h.after.text}”</strong>
            {h.before.kind !== h.after.kind && ` (${KIND_LABELS[h.before.kind]} → ${KIND_LABELS[h.after.kind]})`}
            {h.reviewed && <Badge tone="ok">reviewed</Badge>}
            {h.note && <em className="block text-muted">{h.note}</em>}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function CorrectionSheet({ item, onClose }: { item: MenuItem | null; onClose: () => void }) {
  return (
    <Sheet open={!!item} onClose={onClose} title="Correct master menu">
      {item && <CorrectionForm key={item.id} item={item} onDone={onClose} />}
    </Sheet>
  );
}

function CorrectionForm({ item, onDone }: { item: MenuItem; onDone: () => void }) {
  const [text, setText] = useState(item.text);
  const [kind, setKind] = useState<MenuItemKind>(item.kind);
  const [reviewed, setReviewed] = useState(true);
  const [note, setNote] = useState("");
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (act((s) => ops.correctMenuItem(s, item, { text, kind, reviewed }, note), "Menu updated")) onDone();
      }}
    >
      <p className="text-sm text-muted">This changes every future occurrence of this line in the rotation. To change just one date, use “Change for this date”.</p>
      {item.flag && <Banner>{item.flag}</Banner>}
      <Field label="Menu text">
        <textarea className={`${inputCls} min-h-20 py-2`} value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
      <Field label="Type">
        <select className={inputCls} value={kind} onChange={(e) => setKind(e.target.value as MenuItemKind)}>
          {MENU_ITEM_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Note (optional)">
        <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Checked against posted sheet" />
      </Field>
      <label className="flex items-center gap-3">
        <input type="checkbox" className="h-6 w-6" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} />
        <span className="text-sm font-semibold">Checked against the original sheet (clears the ⚠ flag)</span>
      </label>
      <Button type="submit" size="lg" className="w-full">
        Save correction
      </Button>
    </form>
  );
}

function OverrideSheet({ date, meal, onClose }: { date: ISODate; meal: MealService | null; onClose: () => void }) {
  const state = useAppState((s) => s);
  return (
    <Sheet open={!!meal} onClose={onClose} title={meal ? `Change ${MEAL_LABELS[meal]} · ${formatLong(date)}` : ""}>
      {meal && <OverrideForm key={`${date}-${meal}`} date={date} meal={meal} initial={ops.mealFor(state, date, meal).items} onDone={onClose} />}
    </Sheet>
  );
}

function OverrideForm({ date, meal, initial, onDone }: { date: ISODate; meal: MealService; initial: MenuItem[]; onDone: () => void }) {
  const [rows, setRows] = useState(initial.length ? initial.map((i) => ({ kind: i.kind, text: i.text })) : [{ kind: "main" as MenuItemKind, text: "" }]);
  const [reason, setReason] = useState("");
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (act((s) => ops.setOverride(s, date, meal, rows, reason), "Menu changed for this date")) onDone();
      }}
    >
      <p className="text-sm text-muted">Only this date changes. The 4-week master rotation stays as it is.</p>
      {rows.map((r, i) => (
        <div key={i} className="flex gap-2">
          <select
            aria-label={`Item ${i + 1} type`}
            className={`${inputCls} w-32`}
            value={r.kind}
            onChange={(e) => setRows((x) => x.map((y, j) => (j === i ? { ...y, kind: e.target.value as MenuItemKind } : y)))}
          >
            {MENU_ITEM_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
          <input aria-label={`Item ${i + 1}`} className={inputCls} value={r.text} onChange={(e) => setRows((x) => x.map((y, j) => (j === i ? { ...y, text: e.target.value } : y)))} />
          <button type="button" className="px-2 text-muted" aria-label={`Remove item ${i + 1}`} onClick={() => setRows((x) => x.filter((_, j) => j !== i))}>
            <Icon name="x" />
          </button>
        </div>
      ))}
      <Button variant="ghost" size="sm" onClick={() => setRows((x) => [...x, { kind: "alt", text: "" }])}>
        + Add line
      </Button>
      <Field label="Reason (required)">
        <input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Delivery short on cod" />
      </Field>
      <Button type="submit" size="lg" className="w-full">
        Save change for this date
      </Button>
    </form>
  );
}
