"use client";
import { useMemo, useState } from "react";
import { MEAL_LABELS, type MealService } from "@/lib/menu/types";
import { pickMeal } from "@/lib/profiles";
import * as RD from "@/lib/readiness";
import * as ops from "@/lib/state/ops";
import { useAppState } from "@/lib/state/store";
import { DateBar, MealTabs, useDateMeal } from "../DateMealBar";
import { positionLabel } from "../MenuList";
import { useProfile } from "../useProfile";
import { act, Banner, Button, Card, Empty, Field, inputCls, Sheet } from "../ui";
import { PromptSheet } from "./RequestsPanel";
import { ServiceFlow } from "./ServiceFlow";

export function ReadyScreen() {
  const profile = useProfile("stann");
  const { date, meal, set } = useDateMeal(pickMeal(profile));
  const state = useAppState((s) => s);
  const d = state.workspaces.stann;
  const key = `${date}|${meal}`;
  const rec = d.readiness?.[key];
  const progress = RD.readinessProgress(d.settings.checklist, rec);
  const temps = useMemo(() => (d.temps ?? []).filter((t) => t.date === date && t.meal === meal).sort((a, b) => b.at.localeCompare(a.at)), [d.temps, date, meal]);
  const anyRules = RD.TEMP_KINDS.some((k) => d.settings.tempRules[k].min != null || d.settings.tempRules[k].max != null);
  const items = useMemo(() => {
    const { plan } = ops.productionContext(state, date, meal);
    return plan ? plan.lines.map((l) => l.label) : [];
  }, [state, date, meal]);
  const [voiding, setVoiding] = useState<RD.TempEntry | null>(null);
  const [limitsOpen, setLimitsOpen] = useState(false);
  const [checklistOpen, setChecklistOpen] = useState(false);

  return (
    <div className="space-y-3">
      <DateBar date={date} onChange={(x) => set({ date: x })} subtitle={positionLabel(ops.mealFor(state, date, meal))} />
      <MealTabs meal={meal} meals={profile.meals} onChange={(m) => set({ meal: m })} />
      <ServiceFlow date={date} meal={meal} current="ready" />

      <Card
        title={
          <span>
            Ready for {MEAL_LABELS[meal].toLowerCase()}{" "}
            <span className="text-base font-semibold text-muted">
              {progress.done}/{progress.total}
            </span>
          </span>
        }
        action={
          <Button size="sm" variant="ghost" onClick={() => setChecklistOpen(true)}>
            Edit list
          </Button>
        }
      >
        <ul className="space-y-2">
          {d.settings.checklist.map((i) => {
            const at = rec?.checked[i.id];
            return (
              <li key={i.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={!!at}
                  onClick={() => act((s) => ops.toggleChecklist(s, date, meal, i.id))}
                  className={`flex min-h-14 w-full items-center gap-3 rounded-xl border-2 px-3 text-left ${at ? "border-ok/50 bg-ok-soft" : "border-line bg-surface"}`}
                >
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-2 text-xl font-black ${at ? "border-ok bg-ok text-white" : "border-ink/50"}`} aria-hidden>
                    {at ? "✓" : ""}
                  </span>
                  <span className="flex-1 font-semibold">{i.label}</span>
                  {at && <time className="text-xs text-muted">{new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time>}
                </button>
              </li>
            );
          })}
        </ul>
        {progress.total > 0 && progress.done === progress.total && <p className="mt-3 rounded-xl bg-ok-soft px-3 py-2 font-bold text-ok">✓ Checklist complete</p>}
      </Card>

      <Card
        title="Temperature log"
        action={
          <Button size="sm" variant="ghost" onClick={() => setLimitsOpen(true)}>
            Limits
          </Button>
        }
      >
        {!anyRules ? (
          <Banner>
            No temperature limits are set, so readings are recorded but not checked. Set your facility&apos;s approved limits under{" "}
            <button type="button" className="font-bold underline" onClick={() => setLimitsOpen(true)}>
              Limits
            </button>
            .
          </Banner>
        ) : (
          <p className="text-xs text-muted">
            Checked against your facility&apos;s limits
            {d.settings.tempRulesConfirmed ? ` (confirmed: ${d.settings.tempRulesConfirmed.note})` : ""}. The app records readings; it doesn&apos;t decide whether food is safe to serve.
          </p>
        )}
        <TempForm date={date} meal={meal} items={items} rules={d.settings.tempRules} />
        {temps.length === 0 ? (
          <div className="mt-3">
            <Empty>No readings logged for this service.</Empty>
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-line" aria-label="Readings">
            {temps.map((t) => {
              const st = RD.evaluateTemp(t.tempF, d.settings.tempRules[t.kind]);
              const bad = st.kind === "below" || st.kind === "above";
              return (
                <li key={t.id} className={`py-2 ${t.voided ? "text-muted line-through" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold">
                        {t.item} · {RD.TEMP_KIND_LABELS[t.kind]}
                      </p>
                      <p className="text-sm">
                        <span className="text-xl font-extrabold tabular-nums">{t.tempF} °F</span> <span className="text-muted">({RD.fToC(t.tempF)} °C)</span> ·{" "}
                        <time className="text-muted">{new Date(t.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time>
                      </p>
                      {!t.voided && st.kind !== "no-rule" && (
                        <p className={`text-sm font-semibold ${bad ? "text-danger" : "text-ok"}`}>
                          {bad ? "⚠ " : "✓ "}
                          {st.text}
                        </p>
                      )}
                      {t.action && <p className="text-sm">Action: {t.action}</p>}
                      {t.note && <p className="text-sm text-muted">{t.note}</p>}
                      {t.voided && <p className="text-sm no-underline">Voided: {t.voided.reason}</p>}
                    </div>
                    {!t.voided && (
                      <Button size="sm" variant="ghost" onClick={() => setVoiding(t)} aria-label={`Void reading ${t.item} ${t.tempF}`}>
                        Void
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <PromptSheet
        open={!!voiding}
        title="Void this reading"
        label="Why?"
        help="Readings are never deleted. A voided reading stays in the log, crossed out, with your reason."
        confirm="Void reading"
        onClose={() => setVoiding(null)}
        onSubmit={(v) => !!voiding && act((s) => ops.voidTemp(s, voiding.id, v))}
      />
      <Sheet open={limitsOpen} onClose={() => setLimitsOpen(false)} title="Temperature limits">
        {limitsOpen && <LimitsForm rules={d.settings.tempRules} onDone={() => setLimitsOpen(false)} />}
      </Sheet>
      <Sheet open={checklistOpen} onClose={() => setChecklistOpen(false)} title="Readiness checklist">
        {checklistOpen && <ChecklistForm items={d.settings.checklist.map((i) => i.label)} onDone={() => setChecklistOpen(false)} />}
      </Sheet>
    </div>
  );
}

function TempForm({ date, meal, items, rules }: { date: string; meal: MealService; items: string[]; rules: RD.TempRules }) {
  const [item, setItem] = useState("");
  const [kind, setKind] = useState<RD.TempKind>("hot-hold");
  const [temp, setTemp] = useState("");
  const [scale, setScale] = useState<"F" | "C">("F");
  const [note, setNote] = useState("");
  const [action, setAction] = useState("");
  const tempF = temp.trim() === "" ? null : scale === "F" ? Number(temp) : RD.cToF(Number(temp));
  const preview = tempF != null && Number.isFinite(tempF) ? RD.evaluateTemp(tempF, rules[kind]) : null;
  const bad = preview && (preview.kind === "below" || preview.kind === "above");
  return (
    <form
      className="mt-3 space-y-2 rounded-xl border border-line p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (act((s) => ops.addTemp(s, { date, meal, item, kind, tempF: tempF ?? NaN, note, action }), "Reading logged")) {
          setTemp("");
          setNote("");
          setAction("");
        }
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        <Field label="Food">
          <input className={inputCls} value={item} onChange={(e) => setItem(e.target.value)} list="ready-items" placeholder="Pot pie" />
          <datalist id="ready-items">
            {items.map((i) => (
              <option key={i} value={i} />
            ))}
          </datalist>
        </Field>
        <Field label="Check">
          <select className={inputCls} value={kind} onChange={(e) => setKind(e.target.value as RD.TempKind)}>
            {RD.TEMP_KINDS.map((k) => (
              <option key={k} value={k}>
                {RD.TEMP_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="flex items-end gap-2">
        <Field label="Temperature">
          <input className={`${inputCls} w-28 text-xl font-bold`} inputMode="decimal" value={temp} onChange={(e) => setTemp(e.target.value)} placeholder="165" aria-label={`Temperature in degrees ${scale}`} />
        </Field>
        <div role="radiogroup" aria-label="Scale" className="mb-0.5 grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
          {(["F", "C"] as const).map((x) => (
            <button key={x} type="button" role="radio" aria-checked={scale === x} onClick={() => setScale(x)} className={`h-10 w-12 rounded-lg font-bold ${scale === x ? "bg-primary text-primary-ink" : "text-muted"}`}>
              °{x}
            </button>
          ))}
        </div>
      </div>
      {preview && preview.kind !== "no-rule" && (
        <p role="status" className={`text-sm font-bold ${bad ? "text-danger" : "text-ok"}`}>
          {bad ? "⚠ " : "✓ "}
          {preview.text}
        </p>
      )}
      {bad && (
        <Field label="What did you do about it?" hint="e.g. reheated to 165 °F and rechecked, discarded, moved to ice — per your facility's procedure.">
          <input className={inputCls} value={action} onChange={(e) => setAction(e.target.value)} />
        </Field>
      )}
      <Field label="Note (optional)">
        <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <Button type="submit" className="w-full" disabled={!item.trim() || tempF == null}>
        Log reading
      </Button>
    </form>
  );
}

function LimitsForm({ rules, onDone }: { rules: RD.TempRules; onDone: () => void }) {
  const [r, setR] = useState<Record<RD.TempKind, { min: string; max: string }>>(() =>
    Object.fromEntries(RD.TEMP_KINDS.map((k) => [k, { min: rules[k].min?.toString() ?? "", max: rules[k].max?.toString() ?? "" }])) as Record<RD.TempKind, { min: string; max: string }>,
  );
  const [confirm, setConfirm] = useState("");
  const parse = (): RD.TempRules =>
    Object.fromEntries(RD.TEMP_KINDS.map((k) => [k, { min: r[k].min.trim() === "" ? null : Number(r[k].min), max: r[k].max.trim() === "" ? null : Number(r[k].max) }])) as RD.TempRules;
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (act((s) => ops.setTempRules(s, parse(), confirm), "Limits saved")) onDone();
      }}
    >
      <Banner>
        Use the limits in your facility&apos;s approved food-safety procedures (HACCP plan / policy). The app only compares readings to these numbers — it doesn&apos;t decide what&apos;s safe.
      </Banner>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted">
            <th className="py-1">Check</th>
            <th className="py-1">At least °F</th>
            <th className="py-1">At most °F</th>
          </tr>
        </thead>
        <tbody>
          {RD.TEMP_KINDS.map((k) => (
            <tr key={k}>
              <td className="py-1 pr-2 font-semibold">{RD.TEMP_KIND_LABELS[k]}</td>
              {(["min", "max"] as const).map((f) => (
                <td key={f} className="py-1 pr-1">
                  <input
                    className={`${inputCls} min-h-10`}
                    inputMode="decimal"
                    value={r[k][f]}
                    aria-label={`${RD.TEMP_KIND_LABELS[k]} ${f === "min" ? "at least" : "at most"} °F`}
                    onChange={(e) => setR((x) => ({ ...x, [k]: { ...x[k], [f]: e.target.value } }))}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <Button
        variant="outline"
        className="w-full"
        onClick={() =>
          setR(Object.fromEntries(RD.TEMP_KINDS.map((k) => [k, { min: RD.FOOD_CODE_REFERENCE[k].min?.toString() ?? "", max: RD.FOOD_CODE_REFERENCE[k].max?.toString() ?? "" }])) as Record<RD.TempKind, { min: string; max: string }>)
        }
      >
        Fill in FDA Food Code reference values
      </Button>
      <p className="text-xs text-muted">
        Reference values: final cook &amp; reheat ≥ 165 °F (poultry; other foods differ), hot holding ≥ 135 °F, cold holding ≤ 41 °F. Cooling is a two-stage process and isn&apos;t a single limit. Check them against your facility&apos;s policy before saving.
      </p>
      <Field label="Confirm" hint="Required to save any limits.">
        <input className={inputCls} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Matches our food safety policy — checked with dietary manager" />
      </Field>
      <Button type="submit" size="lg" className="w-full">
        Save limits
      </Button>
    </form>
  );
}

function ChecklistForm({ items, onDone }: { items: string[]; onDone: () => void }) {
  const [text, setText] = useState(items.join("\n"));
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (act((s) => ops.setChecklist(s, text.split("\n")), "Checklist saved")) onDone();
      }}
    >
      <Field label="One item per line">
        <textarea className={`${inputCls} min-h-56 py-2`} value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
      <Button type="submit" size="lg" className="w-full">
        Save
      </Button>
    </form>
  );
}

