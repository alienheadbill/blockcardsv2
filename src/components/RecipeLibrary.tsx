"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { makeRecipe, scaleRecipe, searchRecipes, type Recipe } from "@/lib/recipes/recipes";
import { ALL_UNITS } from "@/lib/recipes/units";
import * as ops from "@/lib/state/ops";
import { useAppState } from "@/lib/state/store";
import type { WorkspaceId } from "@/lib/workspaces";
import { act, Badge, Banner, Button, Card, Empty, Field, inputCls, Sheet } from "./ui";

export function RecipeLibrary({ ws, defaultPortions, showCost = false }: { ws: WorkspaceId; defaultPortions: number; showCost?: boolean }) {
  const recipes = useAppState((s) => s.workspaces[ws].recipes);
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Recipe | "new" | null>(null);
  const openId = params.get("r");
  const open = openId ? recipes.find((r) => r.id === openId) : undefined;
  const results = useMemo(() => searchRecipes(recipes, q), [recipes, q]);
  const go = (id: string | null) => router.push(id ? `${pathname}?r=${id}` : pathname, { scroll: true });

  if (open) return <RecipeDetail recipe={open} ws={ws} defaultPortions={defaultPortions} showCost={showCost} onBack={() => go(null)} onEdit={() => setEditing(open)} editing={editing} setEditing={setEditing} />;

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input type="search" className={inputCls} placeholder="Search recipes or ingredients" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search recipes" />
        <Button onClick={() => setEditing("new")}>+ New</Button>
      </div>
      {results.length === 0 ? (
        <Empty>{recipes.length ? "No recipes match." : "No recipes yet — add your first one."}</Empty>
      ) : (
        <ul className="space-y-2">
          {results.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => go(r.id)} className="w-full rounded-2xl border border-line bg-surface p-4 text-left shadow-sm active:bg-surface-2">
                <span className="flex items-start justify-between gap-2">
                  <span className="text-lg font-bold">{r.name}</span>
                  {r.source === "starter" && <Badge tone="warn">Starter</Badge>}
                </span>
                <span className="text-sm text-muted">
                  {r.category} · yields {r.yieldPortions} · {r.portionSize} · {r.totalMinutes} min
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <RecipeEditor ws={ws} recipe={editing === "new" ? null : editing} open={editing !== null} onClose={() => setEditing(null)} showCost={showCost} />
    </div>
  );
}

function RecipeDetail({
  recipe,
  ws,
  defaultPortions,
  showCost,
  onBack,
  onEdit,
  editing,
  setEditing,
}: {
  recipe: Recipe;
  ws: WorkspaceId;
  defaultPortions: number;
  showCost: boolean;
  onBack: () => void;
  onEdit: () => void;
  editing: Recipe | "new" | null;
  setEditing: (r: Recipe | "new" | null) => void;
}) {
  const [portions, setPortions] = useState(String(defaultPortions));
  const [keepUnits, setKeepUnits] = useState(false);
  const n = Number(portions);
  const scaled = useMemo(() => (n > 0 ? scaleRecipe(recipe, n, keepUnits) : null), [recipe, n, keepUnits]);
  return (
    <div className="space-y-3">
      <button type="button" onClick={onBack} className="text-base font-semibold text-primary underline">
        ← All recipes
      </button>
      <Card>
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-2xl font-extrabold leading-tight">{recipe.name}</h1>
          <Button size="sm" variant="outline" onClick={onEdit}>
            Edit
          </Button>
        </div>
        <p className="mt-1 text-sm text-muted">
          {recipe.category} · base yield {recipe.yieldPortions} × {recipe.portionSize} · active {recipe.activeMinutes} min · total {recipe.totalMinutes} min
          {recipe.versions.length > 0 && ` · revision ${recipe.versions.length + 1}`}
        </p>
        {recipe.source === "starter" && (
          <div className="mt-2">
            <Banner>Starter reference recipe — not a facility-approved production recipe. Use your facility&apos;s approved version where required.</Banner>
          </div>
        )}
      </Card>

      <Card title="Scale">
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Portions">
            <input className={`${inputCls} w-28 text-xl font-bold`} inputMode="numeric" value={portions} onChange={(e) => setPortions(e.target.value.replace(/[^\d]/g, ""))} />
          </Field>
          {[30, 41, 50, 60].map((p) => (
            <Button key={p} size="sm" variant={n === p ? "primary" : "outline"} onClick={() => setPortions(String(p))}>
              {p}
            </Button>
          ))}
        </div>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-5 w-5" checked={keepUnits} onChange={(e) => setKeepUnits(e.target.checked)} /> Keep original units
        </label>
        <p className="mt-1 text-xs text-muted">Volume stays volume and weight stays weight — the app never converts between them.</p>
        {showCost && recipe.costPerBatch != null && n > 0 && (
          <p className="mt-2 text-base font-semibold">
            Food cost: ${((recipe.costPerBatch / recipe.yieldPortions) * n).toFixed(2)} (${(recipe.costPerBatch / recipe.yieldPortions).toFixed(2)} / portion)
          </p>
        )}
      </Card>

      <Card title={`Ingredients${scaled ? ` · ${n} portions` : ""}`}>
        {scaled ? (
          <ul className="divide-y divide-line">
            {scaled.ingredients.map((i) => (
              <li key={i.id} className="flex gap-3 py-2 text-lg">
                <span className="w-28 shrink-0 text-right font-extrabold tabular-nums">{i.display}</span>
                <span>
                  {i.name}
                  {i.note && <span className="text-sm text-muted"> ({i.note})</span>}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Enter a number of portions.</Empty>
        )}
      </Card>

      <Card title="Method">
        <ol className="list-decimal space-y-3 pl-6 text-lg leading-relaxed">
          {recipe.steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      </Card>

      <Card title="Before you start">
        {recipe.equipment.length > 0 && (
          <p className="mb-2">
            <strong>Equipment:</strong> {recipe.equipment.join(", ")}
          </p>
        )}
        {recipe.aheadNotes && (
          <p className="mb-2">
            <strong>Prep ahead:</strong> {recipe.aheadNotes}
          </p>
        )}
        {recipe.safetyCheckpoints.length > 0 && (
          <div className="mb-2">
            <strong>Food-safety checkpoints:</strong>
            <ul className="list-disc pl-6">
              {recipe.safetyCheckpoints.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        )}
        <p>
          <strong>Allergens (listed):</strong> {recipe.allergens.length ? recipe.allergens.join(", ") : "none listed"}{" "}
          {!recipe.allergensVerified && <Badge tone="warn">verify against product labels</Badge>}
        </p>
      </Card>

      {recipe.versions.length > 0 && (
        <Card title="Revision history">
          <ul className="space-y-1 text-sm">
            {[...recipe.versions].reverse().map((v, i) => (
              <li key={i}>
                {new Date(v.at).toLocaleString()} — {v.note}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Button
        variant="ghost"
        className="text-danger"
        onClick={() => {
          if (window.confirm(`Delete “${recipe.name}”?`) && act((s) => ops.deleteRecipe(s, ws, recipe.id), "Recipe deleted")) onBack();
        }}
      >
        Delete recipe
      </Button>
      <RecipeEditor ws={ws} recipe={editing === "new" ? null : editing} open={editing !== null} onClose={() => setEditing(null)} showCost={showCost} />
    </div>
  );
}

function ingredientsToText(r: Recipe | null) {
  return r ? r.ingredients.map((i) => `${i.qty} ${i.unit} ${i.name}${i.note ? ` (${i.note})` : ""}`).join("\n") : "";
}

/** Parse "2.5 lb cooked chicken (diced)" lines. */
export function parseIngredients(text: string): [number, string, string, string?][] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^(\d+(?:\.\d+)?|\d+\/\d+|\d+ \d+\/\d+)\s+(#10 can|\S+)\s+(.+)$/);
      if (!m) throw new Error(`Couldn't read ingredient line: “${line}”. Use: qty unit name`);
      const qtyStr = m[1]!;
      const qty = qtyStr.includes("/")
        ? qtyStr.split(" ").reduce((sum, part) => {
            const [a, b] = part.split("/");
            return sum + (b ? Number(a) / Number(b) : Number(a));
          }, 0)
        : Number(qtyStr);
      const unit = m[2]!;
      if (!ALL_UNITS.includes(unit)) throw new Error(`Unknown unit “${unit}”. Use one of: ${ALL_UNITS.join(", ")}`);
      const nm = m[3]!.match(/^(.*?)\s*\((.+)\)$/);
      return nm ? [qty, unit, nm[1]!, nm[2]!] : [qty, unit, m[3]!];
    });
}

function RecipeEditor({ ws, recipe, open, onClose, showCost }: { ws: WorkspaceId; recipe: Recipe | null; open: boolean; onClose: () => void; showCost: boolean }) {
  return (
    <Sheet open={open} onClose={onClose} title={recipe ? `Edit ${recipe.name}` : "New recipe"}>
      {open && <RecipeForm key={recipe?.id ?? "new"} ws={ws} recipe={recipe} onDone={onClose} showCost={showCost} />}
    </Sheet>
  );
}

function RecipeForm({ ws, recipe, onDone, showCost }: { ws: WorkspaceId; recipe: Recipe | null; onDone: () => void; showCost: boolean }) {
  const [f, setF] = useState({
    name: recipe?.name ?? "",
    category: recipe?.category ?? "Entrée",
    yieldPortions: String(recipe?.yieldPortions ?? 10),
    portionSize: recipe?.portionSize ?? "",
    ingredients: ingredientsToText(recipe),
    steps: recipe?.steps.join("\n") ?? "",
    equipment: recipe?.equipment.join(", ") ?? "",
    activeMinutes: String(recipe?.activeMinutes ?? 0),
    totalMinutes: String(recipe?.totalMinutes ?? 0),
    aheadNotes: recipe?.aheadNotes ?? "",
    safety: recipe?.safetyCheckpoints.join("\n") ?? "",
    allergens: recipe?.allergens.join(", ") ?? "",
    cost: recipe?.costPerBatch != null ? String(recipe.costPerBatch) : "",
    note: "",
  });
  const up = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = () =>
    act((s) => {
      if (!f.name.trim()) throw new Error("Recipe name is required");
      const yieldPortions = Number(f.yieldPortions);
      if (!(yieldPortions > 0)) throw new Error("Yield must be greater than zero");
      const list = (t: string, sep: RegExp) => t.split(sep).map((x) => x.trim()).filter(Boolean);
      const base = makeRecipe({
        name: f.name.trim(),
        category: f.category.trim() || "Other",
        yieldPortions,
        portionSize: f.portionSize.trim() || "1 portion",
        ingredients: parseIngredients(f.ingredients),
        steps: list(f.steps, /\n/),
        equipment: list(f.equipment, /,/),
        activeMinutes: Number(f.activeMinutes) || 0,
        totalMinutes: Number(f.totalMinutes) || 0,
        aheadNotes: f.aheadNotes.trim(),
        safetyCheckpoints: list(f.safety, /\n/),
        allergens: list(f.allergens, /,/),
        source: "user",
        ...(f.cost && Number(f.cost) >= 0 ? { costPerBatch: Number(f.cost) } : {}),
      });
      const next: Recipe = recipe ? { ...base, id: recipe.id, versions: recipe.versions, source: recipe.source } : base;
      return ops.saveRecipe(s, ws, next, f.note);
    }, recipe ? "Recipe revised" : "Recipe saved") && onDone();

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <Field label="Name">
        <input className={inputCls} value={f.name} onChange={up("name")} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Category">
          <input className={inputCls} value={f.category} onChange={up("category")} list="recipe-cats" />
          <datalist id="recipe-cats">
            {["Entrée", "Soup", "Side", "Dessert", "Breakfast", "Salad", "Sandwich", "Sauce"].map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
        <Field label="Yield (portions)">
          <input className={inputCls} inputMode="numeric" value={f.yieldPortions} onChange={up("yieldPortions")} />
        </Field>
      </div>
      <Field label="Portion size">
        <input className={inputCls} value={f.portionSize} onChange={up("portionSize")} placeholder="1 cup" />
      </Field>
      <Field label="Ingredients — one per line" hint={`qty unit name, e.g. "2.5 lb cooked chicken (diced)". Units: ${ALL_UNITS.join(", ")}`}>
        <textarea className={`${inputCls} min-h-36 py-2 font-mono text-sm`} value={f.ingredients} onChange={up("ingredients")} />
      </Field>
      <Field label="Steps — one per line">
        <textarea className={`${inputCls} min-h-32 py-2`} value={f.steps} onChange={up("steps")} />
      </Field>
      <Field label="Equipment (comma separated)">
        <input className={inputCls} value={f.equipment} onChange={up("equipment")} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Active min">
          <input className={inputCls} inputMode="numeric" value={f.activeMinutes} onChange={up("activeMinutes")} />
        </Field>
        <Field label="Total min">
          <input className={inputCls} inputMode="numeric" value={f.totalMinutes} onChange={up("totalMinutes")} />
        </Field>
      </div>
      <Field label="Prep-ahead guidance">
        <input className={inputCls} value={f.aheadNotes} onChange={up("aheadNotes")} />
      </Field>
      <Field label="Food-safety checkpoints — one per line" hint="Use your facility's approved temperatures and procedures.">
        <textarea className={`${inputCls} min-h-20 py-2`} value={f.safety} onChange={up("safety")} />
      </Field>
      <Field label="Allergens (comma separated)" hint="Always verify against product labels.">
        <input className={inputCls} value={f.allergens} onChange={up("allergens")} />
      </Field>
      {showCost && (
        <Field label="Batch food cost ($)">
          <input className={inputCls} inputMode="decimal" value={f.cost} onChange={up("cost")} />
        </Field>
      )}
      {recipe && (
        <Field label="What changed?">
          <input className={inputCls} value={f.note} onChange={up("note")} placeholder="Doubled thyme" />
        </Field>
      )}
      <Button type="submit" size="lg" className="w-full">
        Save recipe
      </Button>
    </form>
  );
}
