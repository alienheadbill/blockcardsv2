"use client";
import { useEffect, useMemo, useState } from "react";
import * as C from "@/lib/counting";
import { addDays, formatShort, localToday, type ISODate } from "@/lib/dates";
import { checkService } from "@/lib/helper";
import { ENTREE_TEXTURES, IDDSI_LEVELS, iddsi, MORE_ENTREE_TEXTURES, textureKey } from "@/lib/iddsi";
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
  const [guideTab, setGuideTab] = useState<"food" | "drink">("food");
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
      <p className="mb-2 text-xs text-muted">
        For a slip with a texture (e.g. “IDDSI Level 5: Minced &amp; Moist”), tap here <strong>instead of</strong> the big box — it counts the meal in the tally and marks the texture. Undo takes both back.
      </p>
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
                    aria-label={`Count one ${o.label}, ${l.name} level ${l.level}. Now ${n}.`}
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
      </div>
      <button type="button" className="mt-2 text-sm font-semibold text-primary underline" onClick={() => setMore((v) => !v)} aria-expanded={more}>
        {more ? "Fewer levels" : "More levels (Liquidised, Easy to Chew)"}
      </button>

      <Sheet open={guide} onClose={() => setGuide(false)} title="IDDSI levels">
        <p className="mb-3 text-sm text-muted">
          Quick reference to the IDDSI framework (iddsi.org). Always follow the resident&apos;s diet order on the slip and your facility&apos;s procedures — the app doesn&apos;t assign textures.
        </p>
        <div role="tablist" aria-label="Guide section" className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
          {(["food", "drink"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={guideTab === k}
              onClick={() => setGuideTab(k)}
              className={`min-h-11 rounded-lg font-bold ${guideTab === k ? "bg-primary text-primary-ink" : "text-muted"}`}
            >
              {k === "food" ? "Foods" : "Drinks"}
            </button>
          ))}
        </div>
        {guideTab === "drink" && <p className="mb-2 text-xs text-muted">Reference only — thickened drinks aren&apos;t counted here.</p>}
        <ul className="space-y-2">
          {IDDSI_LEVELS.filter((l) => l.kind === guideTab).map((l) => (
            <li key={l.id} className="rounded-xl border border-line p-3">
              <p className="flex items-center gap-2 font-bold">
                <Swatch color={l.color} /> Level {l.level} · {l.name}
              </p>
              <p className="text-sm">{l.summary}</p>
              <p className="mt-1 text-xs text-muted">Test: {l.test}</p>
            </li>
          ))}
        </ul>
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
  const today = useMemo(() => P.sortTasks(prep.filter((t) => P.visible(t) && t.date === date)), [prep, date]);
  const viewDate = addDays(date, offset);
  // a menu item is "on the list" if any visible task targets it for that day (any stage)
  const hasTask = (itemId: string, forDate: ISODate, stage?: P.PrepStage) =>
    prep.some((t) => P.visible(t) && t.target?.itemId === itemId && t.target.date === forDate && (!stage || t.target.stage === stage));

  const dayName = (o: number) => (o === 0 ? "Today" : o === 1 ? "Tomorrow" : formatShort(addDays(date, o)));
  const add = (title: string, forMeal: MealService | null, target?: P.PrepTarget, taskDate: ISODate = date) =>
    act((s) => ops.addPrepTask(s, "stann", { date: taskDate, meal: forMeal, title, ...(target ? { target } : {}) }));

  return (
    <Card title={`Prep list · ${today.filter((t) => t.done).length}/${today.length}`}>
      <div role="tablist" aria-label="Menu day" className="mb-2 grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
        {[0, 1, 2].map((o) => (
          <button key={o} type="button" role="tab" aria-selected={offset === o} onClick={() => setOffset(o)} className={`min-h-10 rounded-lg text-sm font-bold ${offset === o ? "bg-primary text-primary-ink" : "text-muted"}`}>
            {dayName(o)}
          </button>
        ))}
      </div>
      <p className="mb-1 text-xs text-muted">
        Tap a menu item to add it to today&apos;s prep list. Finish something ahead and it drops off that day — you&apos;ll get the next step (cook, reheat, portion) instead.
      </p>
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
                    const ahead = P.madeAhead(prep, i.id, viewDate);
                    // Made ahead on an earlier day → offer the next step instead of making it again.
                    const stage: P.PrepStage = ahead ? "finish" : "make";
                    const verb = ahead ? `${P.nextStepVerb(i.kind, short)} ` : "";
                    // the next step for a made-ahead item goes on ITS day's list; anything else goes on today's
                    const title = ahead
                      ? `${verb}${short} — made ahead ${formatShort(ahead.date).split(",")[0]}`
                      : `${short}${offset === 0 ? "" : ` — for ${dayName(offset).toLowerCase()} ${MEAL_LABELS[m].toLowerCase()}`}`;
                    const added = ahead ? hasTask(i.id, viewDate, "finish") : hasTask(i.id, viewDate);
                    const target: P.PrepTarget = { itemId: i.id, label: short, date: viewDate, meal: m, stage, kind: i.kind };
                    return (
                      <button
                        key={i.id}
                        type="button"
                        disabled={added}
                        onClick={() => (ahead ? add(title, m, target, viewDate) : add(title, offset === 0 ? m : null, target))}
                        aria-label={added ? `${short} already on the prep list` : `Add ${title} to prep`}
                        className={`min-h-11 rounded-full border-2 px-3 text-sm font-semibold ${added ? "border-ok/50 bg-ok-soft text-ok" : ahead ? "border-accent bg-accent-soft/50" : "border-dashed border-line active:bg-surface-2"}`}
                      >
                        {added ? "✓ " : "+ "}
                        {ahead && !added ? `${verb}` : i.printedLabel ? `${i.printedLabel}: ` : ""}
                        {short}
                        {ahead && <span className="text-xs font-semibold text-muted"> (made ahead)</span>}
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
                onClick={() => act((s) => ops.togglePrep(s, "stann", t.id))}
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

const REASONS = ["Late admission", "Discharged / left", "Changed their mind", "Diet or texture change", "Slip was wrong", "Room move"];

/** Late admits, discharges and changes — on an open or finished count. */
export function AdjustSheet({ open, onClose, session }: { open: boolean; onClose: () => void; session: C.CountSession }) {
  return (
    <Sheet open={open} onClose={onClose} title="Late admit / change">
      {open && <AdjustForm session={session} onDone={onClose} />}
    </Sheet>
  );
}

function AdjustForm({ session, onDone }: { session: C.CountSession; onDone: () => void }) {
  const boxes = session.options.filter((o) => o.role !== "unresolved");
  const summary = C.summarize(session);
  const [kind, setKind] = useState<"add" | "remove" | "switch">("add");
  const [box, setBox] = useState(boxes[0]?.key ?? "");
  const [to, setTo] = useState(boxes[1]?.key ?? boxes[0]?.key ?? "");
  const [qty, setQty] = useState(1);
  const [texture, setTexture] = useState("");
  const [reason, setReason] = useState("");
  const [other, setOther] = useState("");
  const finalReason = reason === "Other" ? other : reason;

  const BoxPicker = ({ value, onPick, label }: { value: string; onPick: (k: string) => void; label: string }) => (
    <fieldset>
      <legend className="mb-1 text-sm font-bold">{label}</legend>
      <div className="grid grid-cols-2 gap-2">
        {boxes.map((b) => (
          <button
            key={b.key}
            type="button"
            role="radio"
            aria-checked={value === b.key}
            onClick={() => onPick(b.key)}
            className={`min-h-12 rounded-xl border-2 px-2 text-left text-sm font-bold ${value === b.key ? "border-primary bg-accent-soft" : "border-line"}`}
          >
            {b.label} <span className="font-semibold text-muted">({summary.byChoice[b.key] ?? 0})</span>
          </button>
        ))}
      </div>
    </fieldset>
  );

  const submit = () => {
    const change: C.CountChange =
      kind === "switch" ? { kind, from: box, to, qty, ...(texture ? { texture } : {}) } : { kind, box, qty, ...(texture ? { texture } : {}) };
    const describe = kind === "add" ? `+${qty} ${C.labelFor(session, box)}` : kind === "remove" ? `−${qty} ${C.labelFor(session, box)}` : `${qty} → ${C.labelFor(session, to)}`;
    if (
      act(
        (s) => ops.updateSession(s, session.date, session.meal, (x) => C.adjustCount(x, change, finalReason), { action: "count.adjust", detail: `${session.date} ${session.meal}: ${describe} (${finalReason})` }),
        `Count updated: ${describe}`,
      )
    )
      onDone();
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {session.status === "complete" && <p className="text-sm text-muted">This count is finished — it stays finished. The change is added with its reason.</p>}
      <div role="radiogroup" aria-label="Kind of change" className="grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1">
        {(
          [
            ["add", "+ Add"],
            ["remove", "− Remove"],
            ["switch", "⇄ Switch"],
          ] as const
        ).map(([k, l]) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={`min-h-12 rounded-lg font-bold ${kind === k ? "bg-primary text-primary-ink" : "text-muted"}`}>
            {l}
          </button>
        ))}
      </div>

      <BoxPicker value={box} onPick={setBox} label={kind === "switch" ? "From" : kind === "add" ? "Add to" : "Take away from"} />
      {kind === "switch" && <BoxPicker value={to} onPick={setTo} label="To" />}

      <div className="flex items-center gap-3">
        <span className="text-sm font-bold">How many</span>
        <Button variant="outline" onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="Fewer">
          −
        </Button>
        <span className="w-8 text-center text-2xl font-extrabold tabular-nums" aria-live="polite">
          {qty}
        </span>
        <Button variant="outline" onClick={() => setQty((q) => Math.min(99, q + 1))} aria-label="More">
          +
        </Button>
      </div>

      <label className="block">
        <span className="mb-1 block text-sm font-bold">Texture (if the slip has one)</span>
        <select className={inputCls} value={texture} onChange={(e) => setTexture(e.target.value)}>
          <option value="">Regular / none</option>
          {[...ENTREE_TEXTURES, ...MORE_ENTREE_TEXTURES].map((id) => (
            <option key={id} value={id}>
              {iddsi(id).name} (L{iddsi(id).level})
            </option>
          ))}
        </select>
      </label>

      <fieldset>
        <legend className="mb-1 text-sm font-bold">Reason</legend>
        <div className="flex flex-wrap gap-2">
          {[...REASONS, "Other"].map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={reason === r}
              onClick={() => setReason(r)}
              className={`min-h-11 rounded-full border-2 px-3 text-sm font-semibold ${reason === r ? "border-primary bg-primary text-primary-ink" : "border-line"}`}
            >
              {r}
            </button>
          ))}
        </div>
        {reason === "Other" && <input className={`${inputCls} mt-2`} value={other} onChange={(e) => setOther(e.target.value)} placeholder="What happened?" aria-label="Other reason" />}
      </fieldset>

      <Button type="submit" size="lg" className="w-full" disabled={!finalReason.trim()}>
        Save change
      </Button>
    </form>
  );
}

/** Changes made to the count after the slips (late admits, discharges…), in plain words. */
export function ChangesList({ session }: { session: C.CountSession }) {
  const changes = C.changeHistory(session);
  if (!changes.length) return null;
  return (
    <Card title={`Changes (${changes.length})`}>
      <ul className="space-y-1 text-sm" aria-label="Changes to this count">
        {changes.map((c, i) => (
          <li key={i} className="flex gap-2 border-b border-line py-1">
            <time className="w-16 shrink-0 text-muted">{new Date(c.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time>
            <span className="min-w-0">
              <strong>{c.text}</strong> — {c.reason}
              {c.afterComplete && <span className="text-muted"> (after finishing)</span>}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/**
 * One line under the count: "✓ Looks right" or "2 things to check", tap to see them.
 * Rule-based checks on this phone — no AI, nothing is sent anywhere.
 */
export function HelperStrip({ date, meal }: { date: ISODate; meal: MealService }) {
  const state = useAppState((s) => s);
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState<string[]>([]);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  const notes = useMemo(() => checkService(state, date, meal, now, localToday()).filter((n) => !hidden.includes(n.id)), [state, date, meal, now, hidden]);
  const warn = notes.some((n) => n.level === "warn");
  if (!notes.length)
    return (
      <p className="rounded-xl bg-ok-soft px-3 py-2 text-sm font-semibold text-ok" role="status">
        ✓ Helper: everything looks right so far
      </p>
    );
  return (
    <div className={`rounded-xl border-2 px-3 py-2 ${warn ? "border-warn/50 bg-warn-soft" : "border-line bg-surface-2"}`} role="status">
      <button type="button" className="flex w-full items-center justify-between gap-2 text-left text-sm font-bold" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className={warn ? "text-warn" : ""}>
          {warn ? "⚠" : "ℹ"} Helper: {notes.length === 1 ? notes[0]!.text : `${notes.length} things to check`}
        </span>
        {notes.length > 1 && <span aria-hidden>{open ? "▴" : "▾"}</span>}
      </button>
      {(open || notes.length === 1) && (
        <ul className="mt-2 space-y-1">
          {notes.map((n) => (
            <li key={n.id} className="flex items-start gap-2 text-sm">
              <span aria-hidden>{n.level === "warn" ? "⚠" : "ℹ"}</span>
              <span className="flex-1">{notes.length > 1 ? n.text : "Tap “Got it” if that's expected."}</span>
              <button type="button" className="shrink-0 text-xs font-semibold text-muted underline" onClick={() => setHidden((h) => [...h, n.id])}>
                Got it
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
