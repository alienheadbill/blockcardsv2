"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { MEAL_LABELS, type MealService } from "@/lib/menu/types";
import { pickMeal } from "@/lib/profiles";
import * as PR from "@/lib/production";
import { parseAmount } from "@/lib/recipes/convert";
import * as ops from "@/lib/state/ops";
import { dispatch, useAppState } from "@/lib/state/store";
import { DateBar, MealTabs, useDateMeal } from "../DateMealBar";
import { positionLabel } from "../MenuList";
import { useProfile } from "../useProfile";
import { act, Badge, Banner, Button, Card, Empty, Field, inputCls, Sheet, toast } from "../ui";
import { ServiceFlow } from "./ServiceFlow";

const PORTION_UNITS = ["oz", "lb", "fl oz", "cup", "tbsp", "tsp", "qt", "each", "slice", "g", "kg", "ml", "L"];

export function ProductionScreen() {
  const profile = useProfile("stann");
  const { date, meal, set } = useDateMeal(pickMeal(profile));
  const state = useAppState((s) => s);
  const info = useMemo(() => ops.productionContext(state, date, meal), [state, date, meal]);
  const results = useMemo(() => (info.plan ? info.plan.lines.map((l) => ({ line: l, res: PR.computeLine(l, info.ctx) })) : []), [info]);
  const [editing, setEditing] = useState<PR.ProductionLine | null>(null);
  const [servingsFor, setServingsFor] = useState<PR.ProductionLine | null>(null);
  const [amountFor, setAmountFor] = useState<PR.ProductionLine | null>(null);
  const [adding, setAdding] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Keep the plan in step with the count: a line for every tally box and request group.
  const boxSig = info.boxes.map((b) => `${b.key}:${b.label}`).join("|") + info.requests.map((g) => g.item).join("|");
  useEffect(() => {
    if (info.session) {
      try {
        dispatch((s) => ops.ensurePlan(s, date, meal));
      } catch {
        /* nothing to sync */
      }
    }
  }, [date, meal, boxSig, info.session]); // eslint-disable-line react-hooks/exhaustive-deps

  const resolved = ops.mealFor(state, date, meal);

  return (
    <div className="space-y-3">
      <DateBar date={date} onChange={(d) => set({ date: d })} subtitle={positionLabel(resolved)} />
      <MealTabs meal={meal} meals={profile.meals} onChange={(m) => set({ meal: m })} />
      <ServiceFlow date={date} meal={meal} current="production" />

      {!info.session ? (
        <Card>
          <Empty>
            Count the {MEAL_LABELS[meal].toLowerCase()} slips first — production is worked out from the count.{" "}
            <Link className="font-bold text-primary underline" href={`/stann/counts?date=${date}&meal=${meal}`}>
              Go to Count
            </Link>
          </Empty>
        </Card>
      ) : (
        <>
          {info.session.status !== "complete" && (
            <Banner>The count isn&apos;t finished yet — these numbers will change as you keep counting.</Banner>
          )}
          <p className="text-sm text-muted">
            <strong className="text-ink">{info.summary?.totalMeals ?? 0} meals counted.</strong> Set a portion size once per dish — it&apos;s remembered next time. Amounts in bold are rounded <strong>up</strong> to something you can measure; the exact number is shown beside it.
          </p>

          {results.length === 0 ? (
            <Empty>No items yet.</Empty>
          ) : (
            results.map(({ line, res }) => (
              <LineCard
                key={line.id}
                line={line}
                res={res}
                modLabels={info.session!.extras}
                onEdit={() => setEditing(line)}
                onServings={() => setServingsFor(line)}
                onAmount={() => setAmountFor(line)}
                onManual={(n) => act((s) => ops.setManualServings(s, date, meal, line.id, n))}
                onRemove={() => window.confirm(`Remove “${line.label}” from this plan?`) && act((s) => ops.removePlanLine(s, date, meal, line.id))}
              />
            ))
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <Button variant="outline" onClick={() => setAdding(true)}>
              + Add an item (e.g. biscuits, gravy)
            </Button>
            <Button
              size="lg"
              disabled={!results.some((r) => r.res.servings > 0)}
              onClick={() => {
                try {
                  let added = 0;
                  let updated = 0;
                  dispatch((s) => {
                    const r = ops.planToPrep(s, date, meal);
                    added = r.added;
                    updated = r.updated;
                    return r.state;
                  });
                  toast(added || updated ? `Prep list: ${added} added, ${updated} updated` : "Prep list is already up to date");
                } catch (e) {
                  toast(e instanceof Error ? e.message : "Couldn't update prep", "error");
                }
              }}
            >
              Send to prep list →
            </Button>
          </div>

          {info.plan && info.plan.history.length > 0 && (
            <Card>
              <button type="button" className="text-sm font-semibold text-primary underline" onClick={() => setHistoryOpen((v) => !v)} aria-expanded={historyOpen}>
                {historyOpen ? "Hide" : "Show"} changes ({info.plan.history.length})
              </button>
              {historyOpen && (
                <ol className="mt-2 space-y-1 text-sm">
                  {info.plan.history.map((h, i) => (
                    <li key={i} className="border-b border-line py-1">
                      <time className="text-muted">{new Date(h.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time> — {h.text}
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          )}
        </>
      )}

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing ? `Sizes · ${editing.label}` : ""}>
        {editing && <SpecForm key={editing.id} line={editing} date={date} meal={meal} mods={info.session?.extras ?? []} onDone={() => setEditing(null)} />}
      </Sheet>
      <Sheet open={!!servingsFor} onClose={() => setServingsFor(null)} title="Change servings">
        {servingsFor && <ServingsForm key={servingsFor.id} line={servingsFor} counted={PR.computeLine(servingsFor, info.ctx)} date={date} meal={meal} onDone={() => setServingsFor(null)} />}
      </Sheet>
      <Sheet open={!!amountFor} onClose={() => setAmountFor(null)} title="Adjust amount to make">
        {amountFor && <AmountForm key={amountFor.id} line={amountFor} calc={PR.computeLine(amountFor, info.ctx)} date={date} meal={meal} onDone={() => setAmountFor(null)} />}
      </Sheet>
      <Sheet open={adding} onClose={() => setAdding(false)} title="Add an item">
        {adding && <AddLineForm boxes={info.boxes} date={date} meal={meal} onDone={() => setAdding(false)} />}
      </Sheet>
    </div>
  );
}

function LineCard({
  line,
  res,
  modLabels,
  onEdit,
  onServings,
  onAmount,
  onManual,
  onRemove,
}: {
  line: PR.ProductionLine;
  res: PR.LineResult;
  modLabels: { key: string; label: string }[];
  onEdit: () => void;
  onServings: () => void;
  onAmount: () => void;
  onManual: (n: number) => void;
  onRemove: () => void;
}) {
  const [showIngredients, setShowIngredients] = useState(false);
  const sourceText =
    line.source.kind === "box" ? "from the count" : line.source.kind === "request" ? "from special requests" : "fixed number";
  return (
    <section className="rounded-2xl border-2 border-line bg-surface p-4 shadow-sm" aria-label={line.label}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-lg font-extrabold leading-tight">{line.label}</h2>
          <p className="text-sm text-muted">
            {line.portion ? `${line.portion.qty} ${line.portion.unit} per serving` : "No portion size yet"}
            {line.yieldPct != null && ` · ${line.yieldPct}% cooked yield`}
            {line.bufferPct > 0 && ` · +${line.bufferPct}% extra`}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-3xl font-extrabold tabular-nums" data-testid={`servings-${line.label}`}>
            {res.servings}
          </div>
          <div className="text-xs font-semibold text-muted">servings</div>
        </div>
      </div>

      <p className="mt-1 text-xs text-muted">
        {res.counted} {sourceText}
        {res.subtracted > 0 && ` − ${res.subtracted} (${line.subtractKeys.map((k) => modLabels.find((m) => m.key === k)?.label ?? "modification").join(", ")})`}
        {res.overridden && line.servingsOverride && (
          <>
            {" "}
            → <Badge tone="warn">changed to {line.servingsOverride.value}</Badge> <em>{line.servingsOverride.reason}</em>
          </>
        )}
      </p>
      {line.source.kind === "manual" && (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-sm font-semibold">Servings:</span>
          <Button size="sm" variant="outline" aria-label="Fewer" onClick={() => onManual(Math.max(0, (line.manualServings ?? 0) - 1))}>
            −
          </Button>
          <span className="w-8 text-center font-bold tabular-nums">{line.manualServings ?? 0}</span>
          <Button size="sm" variant="outline" aria-label="More" onClick={() => onManual((line.manualServings ?? 0) + 1)}>
            +
          </Button>
        </div>
      )}

      {(res.makeAmount || res.raw || res.recipe) && (
        <dl className="mt-3 space-y-2">
          {res.makeAmount && (
            <div className="rounded-xl bg-accent-soft/60 px-3 py-2">
              <dt className="text-xs font-bold uppercase tracking-wide text-muted">{line.amountOverride ? "Make (adjusted)" : "Have ready (cooked)"}</dt>
              <dd className="text-2xl font-extrabold tabular-nums">
                {res.makeAmount.kitchen}
                {res.makeAmount.roundedUp && <span className="ml-2 text-sm font-semibold text-muted">exact {res.makeAmount.exact}</span>}
              </dd>
              {line.amountOverride && (
                <dd className="text-xs text-muted">
                  Calculated {res.finished?.exact ?? "—"} · {line.amountOverride.reason}
                </dd>
              )}
            </div>
          )}
          {res.raw && !line.amountOverride && (
            <div className="rounded-xl bg-surface-2 px-3 py-2">
              <dt className="text-xs font-bold uppercase tracking-wide text-muted">Start with (raw, at {line.yieldPct}% yield)</dt>
              <dd className="text-xl font-extrabold tabular-nums">
                {res.raw.kitchen}
                {res.raw.roundedUp && <span className="ml-2 text-sm font-semibold text-muted">exact {res.raw.exact}</span>}
              </dd>
            </div>
          )}
          {res.recipe && (
            <div className="rounded-xl bg-surface-2 px-3 py-2">
              <dt className="text-xs font-bold uppercase tracking-wide text-muted">Recipe</dt>
              <dd className="text-base">
                <Link href={`/stann/recipes?r=${res.recipe.recipe.id}`} className="font-bold text-primary underline">
                  {res.recipe.recipe.name}
                </Link>
                : scale to <strong>{res.recipe.portions} portions</strong>
                {res.recipe.portions !== res.recipe.portionsExact && <span className="text-muted"> ({Math.round(res.recipe.portionsExact * 100) / 100} rounded up)</span>} — or{" "}
                <strong>
                  {res.recipe.batches} full batch{res.recipe.batches === 1 ? "" : "es"}
                </strong>{" "}
                of {res.recipe.recipe.yieldPortions} ({res.recipe.batchPortions} portions).
              </dd>
              <dd>
                <button type="button" className="mt-1 text-sm font-semibold text-primary underline" onClick={() => setShowIngredients((v) => !v)} aria-expanded={showIngredients}>
                  {showIngredients ? "Hide" : "Show"} ingredients for {res.recipe.portions}
                </button>
                {showIngredients && (
                  <ul className="mt-1 divide-y divide-line text-sm">
                    {res.recipe.ingredients.map((i) => (
                      <li key={i.id} className="flex gap-2 py-1">
                        <span className="w-24 shrink-0 text-right font-bold tabular-nums">{i.display}</span>
                        <span>{i.name}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </dd>
            </div>
          )}
        </dl>
      )}

      {res.warnings.map((w) => (
        <p key={w} className="mt-2 rounded-lg bg-warn-soft px-2 py-1 text-sm font-semibold text-warn">
          ⚠ {w}
        </p>
      ))}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant={line.portion || line.recipeId ? "outline" : "primary"} onClick={onEdit}>
          {line.portion || line.recipeId ? "Sizes & recipe" : "Set portion size"}
        </Button>
        {line.source.kind !== "manual" && (
          <Button size="sm" variant="outline" onClick={onServings}>
            Change servings
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={onAmount}>
          Adjust amount
        </Button>
        <Button size="sm" variant="ghost" className="text-danger" onClick={onRemove}>
          Remove
        </Button>
      </div>
    </section>
  );
}

function SpecForm({ line, date, meal, mods, onDone }: { line: PR.ProductionLine; date: string; meal: MealService; mods: { key: string; label: string }[]; onDone: () => void }) {
  const recipes = useAppState((s) => s.workspaces.stann.recipes);
  const [label, setLabel] = useState(line.label);
  const [portionQty, setPortionQty] = useState(line.portion ? String(line.portion.qty) : "");
  const [portionUnit, setPortionUnit] = useState(line.portion?.unit ?? "oz");
  const [yieldPct, setYieldPct] = useState(line.yieldPct != null ? String(line.yieldPct) : "");
  const [buffer, setBuffer] = useState(String(line.bufferPct));
  const [recipeId, setRecipeId] = useState(line.recipeId ?? "");
  const [subtract, setSubtract] = useState<string[]>(line.subtractKeys);
  const [testRaw, setTestRaw] = useState("");
  const [testCooked, setTestCooked] = useState("");
  const [testUnit, setTestUnit] = useState("lb");
  const modOptions = mods.filter((m) => m.key.startsWith("x_"));
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const pq = parseAmount(portionQty);
        if (portionQty.trim() && pq === null) return toast("Portion must be a number like 4, 1/2 or 1.5", "error");
        if (
          act(
            (s) =>
              ops.setLineSpec(s, date, meal, line.id, {
                label,
                portion: pq ? { qty: pq, unit: portionUnit } : null,
                yieldPct: yieldPct.trim() ? Number(yieldPct) : null,
                bufferPct: Number(buffer) || 0,
                subtractKeys: subtract,
                ...(recipeId ? { recipeId } : {}),
              }),
            "Saved — remembered for next time",
          )
        )
          onDone();
      }}
    >
      <Field label="Name">
        <input className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)} />
      </Field>
      <Field label="Portion per serving (as served, cooked)" hint="e.g. 4 oz chicken, 1 cup soup, 1 each biscuit. Leave blank if you only need the recipe scaled.">
        <div className="flex gap-2">
          <input className={`${inputCls} w-28 text-lg font-bold`} inputMode="decimal" value={portionQty} onChange={(e) => setPortionQty(e.target.value)} placeholder="4" aria-label="Portion amount" />
          <select className={inputCls} value={portionUnit} onChange={(e) => setPortionUnit(e.target.value)} aria-label="Portion unit">
            {PORTION_UNITS.map((u) => (
              <option key={u} value={u}>
                {u === "oz" ? "oz (weight)" : u === "fl oz" ? "fl oz (volume)" : u}
              </option>
            ))}
          </select>
        </div>
      </Field>
      <Field label="Cooked yield % (optional)" hint="Cooked weight ÷ raw weight. Used to work out how much raw to start with. Leave blank if you portion it raw or it doesn't change.">
        <input className={`${inputCls} w-28`} inputMode="decimal" value={yieldPct} onChange={(e) => setYieldPct(e.target.value)} placeholder="e.g. 72" aria-label="Cooked yield percent" />
      </Field>
      <details className="rounded-xl bg-surface-2 p-3 text-sm">
        <summary className="cursor-pointer font-semibold">Work out yield from a test batch</summary>
        <p className="mt-2 text-muted">Weigh it raw, cook it, weigh it again.</p>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <input className={`${inputCls} w-24`} inputMode="decimal" value={testRaw} onChange={(e) => setTestRaw(e.target.value)} placeholder="Raw" aria-label="Raw weight" />
          <input className={`${inputCls} w-24`} inputMode="decimal" value={testCooked} onChange={(e) => setTestCooked(e.target.value)} placeholder="Cooked" aria-label="Cooked weight" />
          <select className={`${inputCls} w-20`} value={testUnit} onChange={(e) => setTestUnit(e.target.value)} aria-label="Weight unit">
            {["lb", "oz", "kg", "g"].map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
          <Button
            variant="outline"
            onClick={() => {
              try {
                const y = PR.yieldFromTest({ qty: parseAmount(testRaw) ?? 0, unit: testUnit }, { qty: parseAmount(testCooked) ?? 0, unit: testUnit });
                setYieldPct(String(y));
                toast(`Yield ${y}%`);
              } catch (err) {
                toast(err instanceof Error ? err.message : "Check the weights", "error");
              }
            }}
          >
            Use
          </Button>
        </div>
      </details>
      <Field label="Extra to make (%)" hint="Buffer for spills, seconds or late slips. 0 = exactly the count.">
        <input className={`${inputCls} w-28`} inputMode="decimal" value={buffer} onChange={(e) => setBuffer(e.target.value)} aria-label="Extra percent" />
      </Field>
      <Field label="Recipe (optional)" hint="Scales the recipe to the servings and shows full batches.">
        <select className={inputCls} value={recipeId} onChange={(e) => setRecipeId(e.target.value)}>
          <option value="">None</option>
          {recipes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} (makes {r.yieldPortions})
            </option>
          ))}
        </select>
      </Field>
      {modOptions.length > 0 && (
        <fieldset>
          <legend className="mb-1 text-sm font-bold">Subtract modifications</legend>
          {modOptions.map((m) => (
            <label key={m.key} className="flex min-h-11 items-center gap-2">
              <input type="checkbox" className="h-5 w-5" checked={subtract.includes(m.key)} onChange={(e) => setSubtract((x) => (e.target.checked ? [...x, m.key] : x.filter((k) => k !== m.key)))} />
              {m.label}
            </label>
          ))}
        </fieldset>
      )}
      <Button type="submit" size="lg" className="w-full">
        Save
      </Button>
    </form>
  );
}

function ServingsForm({ line, counted, date, meal, onDone }: { line: PR.ProductionLine; counted: PR.LineResult; date: string; meal: MealService; onDone: () => void }) {
  const [value, setValue] = useState(String(line.servingsOverride?.value ?? counted.counted - counted.subtracted));
  const [reason, setReason] = useState("");
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (act((s) => ops.setServingsOverride(s, date, meal, line.id, Number(value), reason), "Servings changed")) onDone();
      }}
    >
      <p className="text-sm text-muted">The count says {counted.counted - counted.subtracted}. Changing it here doesn&apos;t change the count — it&apos;s recorded with your reason.</p>
      <Field label="Servings to make">
        <input className={`${inputCls} w-28 text-xl font-bold`} inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value.replace(/\D/g, ""))} />
      </Field>
      <Field label="Reason (required)">
        <input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Two late admits on Lilac" />
      </Field>
      <Button type="submit" size="lg" className="w-full" disabled={!reason.trim() || value === ""}>
        Save
      </Button>
      {line.servingsOverride && (
        <Button variant="ghost" className="w-full" onClick={() => act((s) => ops.setServingsOverride(s, date, meal, line.id, null, "")) && onDone()}>
          Go back to the count ({counted.counted - counted.subtracted})
        </Button>
      )}
    </form>
  );
}

function AmountForm({ line, calc, date, meal, onDone }: { line: PR.ProductionLine; calc: PR.LineResult; date: string; meal: MealService; onDone: () => void }) {
  const [qty, setQty] = useState(line.amountOverride ? String(line.amountOverride.qty) : calc.finished ? String(calc.finished.qty) : "");
  const [unit, setUnit] = useState(line.amountOverride?.unit ?? calc.finished?.unit ?? line.portion?.unit ?? "lb");
  const [reason, setReason] = useState("");
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const q = parseAmount(qty);
        if (act((s) => ops.setAmountOverride(s, date, meal, line.id, { qty: q ?? 0, unit }, reason), "Amount adjusted")) onDone();
      }}
    >
      <p className="text-sm text-muted">Calculated: {calc.finished ? calc.finished.exact : "— (no portion size)"}. Use this for a full pan, a case size, or whatever you actually make.</p>
      <div className="flex gap-2">
        <input className={`${inputCls} w-28 text-xl font-bold`} inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} aria-label="Amount" />
        <select className={inputCls} value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Unit">
          {PORTION_UNITS.concat(["gal", "pt", "pan", "case"]).map((u) => (
            <option key={u}>{u}</option>
          ))}
        </select>
      </div>
      <Field label="Reason (required)">
        <input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Making a full hotel pan" />
      </Field>
      <Button type="submit" size="lg" className="w-full" disabled={!reason.trim()}>
        Save
      </Button>
      {line.amountOverride && (
        <Button variant="ghost" className="w-full" onClick={() => act((s) => ops.setAmountOverride(s, date, meal, line.id, null, "")) && onDone()}>
          Use the calculated amount
        </Button>
      )}
    </form>
  );
}

function AddLineForm({ boxes, date, meal, onDone }: { boxes: { key: string; label: string }[]; date: string; meal: MealService; onDone: () => void }) {
  const [label, setLabel] = useState("");
  const [basis, setBasis] = useState(boxes[0] ? `box:${boxes[0].key}` : "manual");
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const source: PR.LineSource = basis === "manual" ? { kind: "manual" } : { kind: "box", key: basis.slice(4) };
        if (act((s) => ops.addPlanLine(s, date, meal, label, source), "Item added")) onDone();
      }}
    >
      <Field label="What">
        <input className={inputCls} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Biscuits" />
      </Field>
      <Field label="How many">
        <select className={inputCls} value={basis} onChange={(e) => setBasis(e.target.value)}>
          {boxes.map((b) => (
            <option key={b.key} value={`box:${b.key}`}>
              One per {b.label} served
            </option>
          ))}
          <option value="manual">A number I&apos;ll type in</option>
        </select>
      </Field>
      <Button type="submit" size="lg" className="w-full" disabled={!label.trim()}>
        Add
      </Button>
    </form>
  );
}
