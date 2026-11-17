"use client";
import { useMemo, useState } from "react";
import { equivalents, KNOWN_INGREDIENTS, parseAmount, UNIT_GROUPS, type Equivalent } from "@/lib/recipes/convert";
import { COUNT_UNITS, formatAmount } from "@/lib/recipes/units";
import * as ops from "@/lib/state/ops";
import { useAppState } from "@/lib/state/store";
import { act, Badge, Button, Field, inputCls, Sheet } from "./ui";

export interface ConvertPreset {
  qty: number;
  unit: string;
  ingredient: string;
}

/** Bottom sheet: type an amount, see every other way to measure it. */
export function ConverterSheet({ open, onClose, preset }: { open: boolean; onClose: () => void; preset?: ConvertPreset | null }) {
  return (
    <Sheet open={open} onClose={onClose} title="Measurement converter">
      {open && <ConverterBody key={preset ? `${preset.qty}-${preset.unit}-${preset.ingredient}` : "blank"} preset={preset ?? null} />}
    </Sheet>
  );
}

function amountText(n: number) {
  return formatAmount(n, "x").replace(/ x$/, "");
}

function ConverterBody({ preset }: { preset: ConvertPreset | null }) {
  const custom = useAppState((s) => s.conversions ?? []);
  const [amount, setAmount] = useState(preset ? amountText(preset.qty) : "1");
  const [unit, setUnit] = useState(preset?.unit ?? "cup");
  const [ingredient, setIngredient] = useState(preset?.ingredient ?? "");
  const qty = parseAmount(amount);
  const result = useMemo(() => (qty !== null ? equivalents(qty, unit, ingredient, custom) : null), [qty, unit, ingredient, custom]);
  const units = UNIT_GROUPS.some((g) => g.units.includes(unit)) || (COUNT_UNITS as readonly string[]).includes(unit) ? null : unit;

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Field label="Amount">
          <input
            className={`${inputCls} w-28 text-xl font-bold`}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="1 1/2"
            aria-label="Amount"
          />
        </Field>
        <Field label="Unit">
          <select className={`${inputCls} text-lg font-semibold`} value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Unit">
            {UNIT_GROUPS.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.units.map((u) => (
                  <option key={u} value={u}>
                    {u === "oz" ? "oz (weight)" : u === "fl oz" ? "fl oz (volume)" : u}
                  </option>
                ))}
              </optgroup>
            ))}
            <optgroup label="Counted">
              {COUNT_UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </optgroup>
            {units && <option value={units}>{units}</option>}
          </select>
        </Field>
      </div>
      <Field label="Ingredient (for cups ↔ weight)" hint="Optional. Needed to turn weight into cups or cups into weight.">
        <input className={inputCls} value={ingredient} onChange={(e) => setIngredient(e.target.value)} list="known-ingredients" placeholder="e.g. elbow macaroni" aria-label="Ingredient" autoComplete="off" />
        <datalist id="known-ingredients">
          {[...custom.map((c) => c.name), ...KNOWN_INGREDIENTS].map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      </Field>

      {qty === null ? (
        <p className="text-sm font-semibold text-danger">Type a number like 2, 1.5, 3/4 or 1 1/2.</p>
      ) : (
        result && (
          <div className="space-y-3" aria-live="polite">
            <p className="text-lg font-extrabold">
              {formatAmount(qty, unit)}
              {ingredient.trim() ? ` ${ingredient.trim()}` : ""} =
            </p>
            {result.exact.length > 0 && <Rows title="Exactly" rows={result.exact} />}
            {result.approx.length > 0 && result.density && (
              <Rows
                title="About"
                sub={`${result.density.source === "custom" ? "Your conversion" : "Typical"}: 1 cup ${result.density.name.toLowerCase()} ≈ ${Math.round(result.density.gramsPerCup)} g`}
                rows={result.approx}
                approx
              />
            )}
            {result.notes.map((n) => (
              <p key={n} className="rounded-xl bg-surface-2 px-3 py-2 text-sm">
                {n}
              </p>
            ))}
            {result.approx.length > 0 && (
              <p className="text-xs text-muted">Cups ↔ weight depends on how it&apos;s scooped, packed or chopped. Weigh it when it matters.</p>
            )}
          </div>
        )
      )}

      <SaveConversion defaultName={ingredient} />
    </div>
  );
}

function Rows({ title, sub, rows, approx }: { title: string; sub?: string; rows: Equivalent[]; approx?: boolean }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-muted">{title}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
      <div className="mb-1" />
      <ul className="grid grid-cols-2 gap-2">
        {rows.map((r) => (
          <li key={r.unit} className={`rounded-xl border px-3 py-2 text-lg font-bold tabular-nums ${approx ? "border-dashed border-line" : "border-line bg-surface-2"}`}>
            {approx ? "≈ " : ""}
            {r.text}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SaveConversion({ defaultName }: { defaultName: string }) {
  const custom = useAppState((s) => s.conversions ?? []);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName);
  const [vol, setVol] = useState("1");
  const [volUnit, setVolUnit] = useState("cup");
  const [wt, setWt] = useState("");
  const [wtUnit, setWtUnit] = useState("oz");
  if (!open)
    return (
      <div className="border-t border-line pt-3">
        <Button size="sm" variant="ghost" onClick={() => (setName(defaultName), setOpen(true))}>
          + Save my own conversion
        </Button>
        {custom.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm">
            {custom.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2">
                <span>
                  <Badge tone="ok">mine</Badge> 1 cup {c.name} ≈ {Math.round(c.gramsPerCup)} g ({formatAmount(c.gramsPerCup / 28.349523125, "oz")})
                </span>
                <button type="button" className="text-muted underline" onClick={() => act((s) => ops.deleteConversion(s, c.id))}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  return (
    <form
      className="space-y-2 border-t border-line pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        const v = parseAmount(vol);
        const w = parseAmount(wt);
        if (act((s) => ops.saveConversion(s, name, { qty: v ?? 0, unit: volUnit }, { qty: w ?? 0, unit: wtUnit }), "Conversion saved")) setOpen(false);
      }}
    >
      <p className="text-sm font-bold">Weigh it once, and the app remembers</p>
      <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ingredient (e.g. ziti, dry)" aria-label="Ingredient to save" />
      <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
        <input className={`${inputCls} w-20`} value={vol} onChange={(e) => setVol(e.target.value)} inputMode="decimal" aria-label="Volume amount" />
        <select className={`${inputCls} w-24`} value={volUnit} onChange={(e) => setVolUnit(e.target.value)} aria-label="Volume unit">
          {UNIT_GROUPS[0]!.units.concat(["ml", "L"]).map((u) => (
            <option key={u}>{u}</option>
          ))}
        </select>
        <span>weighs</span>
        <input className={`${inputCls} w-20`} value={wt} onChange={(e) => setWt(e.target.value)} inputMode="decimal" aria-label="Weight amount" placeholder="4" />
        <select className={`${inputCls} w-20`} value={wtUnit} onChange={(e) => setWtUnit(e.target.value)} aria-label="Weight unit">
          {["oz", "lb", "g", "kg"].map((u) => (
            <option key={u}>{u}</option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <Button type="submit" className="flex-1">
          Save
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
