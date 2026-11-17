"use client";
import { useMemo, useState } from "react";
import * as C from "@/lib/counting";
import { addDays, formatShort, type ISODate } from "@/lib/dates";
import { DRINK_TEXTURES, DRINKS_TARGET, ENTREE_TEXTURES, IDDSI_LEVELS, iddsi, MORE_ENTREE_TEXTURES, textureKey } from "@/lib/iddsi";
import { MEAL_LABELS, type MealService } from "@/lib/menu/types";
import * as P from "@/lib/prep";
import * as ops from "@/lib/state/ops";
import { useAppState } from "@/lib/state/store";
import { useProfile } from "../useProfile";
import { act, Button, Card, inputCls, Sheet } from "../ui";

function Swatch({ color }: { color: string }) {
  return <span className="inline-block h-3 w-3 shrink-0 rounded-full border border-ink/40" style={{ background: color }} aria-hidden />;
}

/**
 * IDDSI texture counters per entrée, as printed on the slips.
 * They never change the meal total; they say how many of each entrée need a texture.
 */
export function TexturesCard({
  session,
  items,
  locked,
  onTap,
}: {
  session: C.CountSession;
  items: Record<string, number>;
  locked: boolean;
  onTap: (levelId: string, target: string) => void;
}) {
  const [more, setMore] = useState(false);
  const [guide, setGuide] = useState(false);
  const entrees = session.options.filter((o) => o.role === "main" || o.role === "alt");
  const levels = more ? [...ENTREE_TEXTURES, ...MORE_ENTREE_TEXTURES] : [...ENTREE_TEXTURES];
  const count = (levelId: string, target: string) => items[textureKey(levelId, target)] ?? 0;

  return (
    <Card
      title="Textures (IDDSI)"
      action={
        <Button size="sm" variant="ghost" onClick={() => setGuide(true)}>
          Level guide
        </Button>
      }
    >
      <p className="mb-2 text-xs text-muted">Count what the slip says (e.g. “IDDSI Level 5: Minced &amp; Moist”). Doesn&apos;t change the meal total.</p>
      <div className="space-y-3">
        {entrees.map((o) => (
          <div key={o.key}>
            <p className="mb-1 text-sm font-bold">{o.label}</p>
            <div className="grid grid-cols-3 gap-2">
              {levels.map((id) => {
                const l = iddsi(id);
                const n = count(id, o.key);
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={locked}
                    onClick={() => onTap(id, o.key)}
                    aria-label={`Add one ${l.name} level ${l.level} ${o.label}. Now ${n}.`}
                    className={`flex min-h-14 flex-col justify-center rounded-xl border-2 px-2 text-left active:scale-[0.97] disabled:opacity-50 ${n ? "border-primary bg-accent-soft/50" : "border-line bg-surface"}`}
                  >
                    <span className="flex items-center gap-1 text-[11px] font-bold text-muted">
                      <Swatch color={l.color} /> L{l.level}
                    </span>
                    <span className="flex items-baseline justify-between gap-1">
                      <span className="text-xs font-bold leading-tight">{l.short}</span>
                      <span className="text-lg font-extrabold tabular-nums">{n}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <div>
          <p className="mb-1 text-sm font-bold">Thickened drinks</p>
          <div className="grid grid-cols-4 gap-2">
            {DRINK_TEXTURES.map((id) => {
              const l = iddsi(id);
              const n = count(id, DRINKS_TARGET);
              return (
                <button
                  key={id}
                  type="button"
                  disabled={locked}
                  onClick={() => onTap(id, DRINKS_TARGET)}
                  aria-label={`Add one ${l.name} drink, level ${l.level}. Now ${n}.`}
                  className={`flex min-h-14 flex-col justify-center rounded-xl border-2 px-1 text-center active:scale-[0.97] disabled:opacity-50 ${n ? "border-primary bg-accent-soft/50" : "border-line bg-surface"}`}
                >
                  <span className="flex items-center justify-center gap-1 text-[11px] font-bold text-muted">
                    <Swatch color={l.color} /> L{l.level}
                  </span>
                  <span className="text-[11px] font-bold leading-tight">{l.short}</span>
                  <span className="text-base font-extrabold tabular-nums">{n}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <button type="button" className="mt-2 text-sm font-semibold text-primary underline" onClick={() => setMore((v) => !v)} aria-expanded={more}>
        {more ? "Fewer levels" : "More levels (Liquidised, Easy to Chew)"}
      </button>

      <Sheet open={guide} onClose={() => setGuide(false)} title="IDDSI levels">
        <p className="mb-3 text-sm text-muted">
          Quick reference to the IDDSI framework (iddsi.org). Always follow the resident&apos;s diet order on the slip and your facility&apos;s procedures — the app doesn&apos;t assign textures.
        </p>
        {(["food", "drink"] as const).map((k) => (
          <div key={k} className="mb-4">
            <h3 className="mb-2 font-extrabold">{k === "food" ? "Foods" : "Drinks"}</h3>
            <ul className="space-y-2">
              {IDDSI_LEVELS.filter((l) => l.kind === k).map((l) => (
                <li key={l.id} className="rounded-xl border border-line p-3">
                  <p className="flex items-center gap-2 font-bold">
                    <Swatch color={l.color} /> Level {l.level} · {l.name}
                  </p>
                  <p className="text-sm">{l.summary}</p>
                  <p className="mt-1 text-xs text-muted">Test: {l.test}</p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Sheet>
    </Card>
  );
}

/**
 * Build today's prep list while counting: look at the menu for today and the next
 * two days, tap anything you can get ahead on, or type your own task.
 */
export function PrepWhileCounting({ date, meal }: { date: ISODate; meal: MealService }) {
  const state = useAppState((s) => s);
  const profile = useProfile("stann");
  const [offset, setOffset] = useState(0);
  const [text, setText] = useState("");
  const prep = state.workspaces.stann.prep;
  const today = useMemo(() => P.sortTasks(prep.filter((t) => t.date === date)), [prep, date]);
  const viewDate = addDays(date, offset);
  const titles = new Set(today.map((t) => t.title.toLowerCase()));

  const dayName = (o: number) => (o === 0 ? "Today" : o === 1 ? "Tomorrow" : formatShort(addDays(date, o)));
  const add = (title: string, forMeal: MealService | null) => act((s) => ops.addPrepTask(s, "stann", { date, meal: forMeal, title }));

  return (
    <Card title={`Prep list · ${today.filter((t) => t.done).length}/${today.length}`}>
      <div role="tablist" aria-label="Menu day" className="mb-2 grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
        {[0, 1, 2].map((o) => (
          <button key={o} type="button" role="tab" aria-selected={offset === o} onClick={() => setOffset(o)} className={`min-h-10 rounded-lg text-sm font-bold ${offset === o ? "bg-primary text-primary-ink" : "text-muted"}`}>
            {dayName(o)}
          </button>
        ))}
      </div>
      <p className="mb-1 text-xs text-muted">Tap a menu item to add it to today&apos;s prep list.</p>
      <div className="mb-3 space-y-2">
        {profile.meals.map((m) => {
          const r = ops.mealFor(state, viewDate, m);
          if (!r.items.length) return null;
          return (
            <div key={m}>
              {profile.meals.length > 1 && <p className="text-xs font-bold text-muted">{MEAL_LABELS[m]}</p>}
              <div className="flex flex-wrap gap-2">
                {r.items
                  .filter((i) => !/danish|doughnut|yogurt/i.test(i.text))
                  .map((i) => {
                    const short = C.shortEntreeName(i.text);
                    const title = offset === 0 ? short : `${short} — for ${dayName(offset).toLowerCase()} ${MEAL_LABELS[m].toLowerCase()}`;
                    const added = titles.has(title.toLowerCase());
                    return (
                      <button
                        key={i.id}
                        type="button"
                        disabled={added}
                        onClick={() => add(title, offset === 0 ? m : null)}
                        aria-label={added ? `${short} already on the prep list` : `Add ${title} to prep`}
                        className={`min-h-11 rounded-full border-2 px-3 text-sm font-semibold ${added ? "border-ok/50 bg-ok-soft text-ok" : "border-dashed border-line active:bg-surface-2"}`}
                      >
                        {added ? "✓ " : "+ "}
                        {i.printedLabel ? `${i.printedLabel}: ` : ""}
                        {short}
                      </button>
                    );
                  })}
              </div>
            </div>
          );
        })}
      </div>

      <form
        className="mb-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (add(text, null)) setText("");
        }}
      >
        <input className={inputCls} value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a prep task (e.g. Pull biscuits)" aria-label="New prep task" />
        <Button type="submit" variant="outline" disabled={!text.trim()}>
          Add
        </Button>
      </form>

      {today.length === 0 ? (
        <p className="text-sm text-muted">Nothing on today&apos;s prep list yet.</p>
      ) : (
        <ul className="paper divide-y divide-rule rounded-xl border border-line" aria-label="Today's prep list">
          {today.map((t) => (
            <li key={t.id} className="flex items-center gap-3 px-2 py-1.5">
              <button
                type="button"
                role="checkbox"
                aria-checked={t.done}
                aria-label={`${t.done ? "Mark not done" : "Mark done"}: ${t.title}`}
                onClick={() => act((s) => ops.updatePrepTask(s, "stann", t.id, P.toggleDone, "prep.toggle"))}
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border-2 text-xl font-black ${t.done ? "border-ok bg-ok text-white" : "border-ink/60 bg-surface"}`}
              >
                {t.done ? "✓" : ""}
              </button>
              <span className={`flex-1 text-base ${t.done ? "text-muted line-through" : "font-semibold"}`}>{t.title}</span>
              <button type="button" onClick={() => act((s) => ops.deletePrepTask(s, "stann", t.id))} className="p-2 text-sm text-muted underline" aria-label={`Remove ${t.title}`}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
