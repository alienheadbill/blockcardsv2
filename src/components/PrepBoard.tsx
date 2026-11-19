"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { addDays, formatShort, type ISODate } from "@/lib/dates";
import { MEAL_LABELS, MEAL_SERVICES, type MealService } from "@/lib/menu/types";
import * as P from "@/lib/prep";
import * as ops from "@/lib/state/ops";
import { useAppState } from "@/lib/state/store";
import { WORKSPACES, type WorkspaceId } from "@/lib/workspaces";
import { act, Badge, Button, Card, Empty, Field, inputCls, Sheet } from "./ui";

const GROUPS = [
  { offset: 0, label: "Today" },
  { offset: 1, label: "Tomorrow" },
  { offset: 2, label: "Two Days Ahead" },
];

export function PrepBoard({
  ws,
  baseDate,
  suggestions = [],
  withMeals = true,
  meals,
}: {
  ws: WorkspaceId;
  baseDate: ISODate;
  suggestions?: P.PrepSuggestion[];
  withMeals?: boolean;
  /** Only show tasks for these meals (plus tasks with no meal). Others are behind a toggle. */
  meals?: readonly MealService[];
}) {
  const all = useAppState((s) => s.workspaces[ws]);
  // tasks covered by something made ahead are hidden everywhere
  const raw = useMemo(() => ({ ...all, prep: all.prep.filter(P.visible) }), [all]);
  const [showOther, setShowOther] = useState(false);
  const mine = (t: P.PrepTask) => !meals || !t.meal || meals.includes(t.meal);
  const hiddenCount = raw.prep.filter((t) => !mine(t) && t.date >= baseDate && t.date <= addDays(baseDate, 2)).length;
  const data = useMemo(() => (showOther ? raw : { ...raw, prep: raw.prep.filter(mine) }), [raw, showOther, meals]); // eslint-disable-line react-hooks/exhaustive-deps
  const [editing, setEditing] = useState<P.PrepTask | "new" | null>(null);
  const [newDate, setNewDate] = useState(baseDate);
  const pending = useMemo(() => P.pendingSuggestions(suggestions, data.prep, data.dismissedSuggestions), [suggestions, data.prep, data.dismissedSuggestions]);
  const overdue = useMemo(() => data.prep.filter((t) => !t.done && t.date < baseDate), [data.prep, baseDate]);

  return (
    <div className="space-y-3">
      {overdue.length > 0 && (
        <Card title={<span className="text-warn">Earlier, not done ({overdue.length})</span>}>
          <TaskList tasks={P.sortTasks(overdue)} ws={ws} onEdit={setEditing} showDate />
        </Card>
      )}

      {GROUPS.map((g) => {
        const date = addDays(baseDate, g.offset);
        const tasks = P.sortTasks(data.prep.filter((t) => t.date === date));
        const prog = P.progress(tasks);
        const sugg = pending.filter((s) => s.date === date);
        return (
          <Card
            key={g.offset}
            title={
              <span>
                {g.label} <span className="text-sm font-semibold text-muted">{formatShort(date)}</span>
              </span>
            }
            action={
              <Button
                size="sm"
                onClick={() => {
                  setNewDate(date);
                  setEditing("new");
                }}
                aria-label={`Add task for ${g.label}`}
              >
                + Task
              </Button>
            }
          >
            {tasks.length > 0 && (
              <div className="mb-2">
                <div className="flex justify-between text-xs font-bold text-muted">
                  <span>
                    {prog.done} of {prog.total} done
                  </span>
                  <span>{prog.pct}%</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={prog.pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${g.label} prep progress`}>
                  <div className="h-full bg-ok transition-all" style={{ width: `${prog.pct}%` }} />
                </div>
              </div>
            )}
            {tasks.length ? <TaskList tasks={tasks} ws={ws} onEdit={setEditing} /> : <Empty>No prep tasks yet.</Empty>}
            {sugg.length > 0 && <Suggestions ws={ws} items={sugg} />}
          </Card>
        );
      })}

      {(hiddenCount > 0 || showOther) && meals && (
        <button type="button" className="text-sm font-semibold text-primary underline" onClick={() => setShowOther((v) => !v)}>
          {showOther ? "Show only my meals" : `Show ${hiddenCount} task(s) for other meals`}
        </button>
      )}

      <Templates ws={ws} date={baseDate} withMeals={withMeals} />

      <TaskSheet ws={ws} task={editing === "new" ? null : editing} open={editing !== null} defaultDate={newDate} withMeals={withMeals} onClose={() => setEditing(null)} />
    </div>
  );
}

function TaskList({ tasks, ws, onEdit, showDate }: { tasks: P.PrepTask[]; ws: WorkspaceId; onEdit: (t: P.PrepTask) => void; showDate?: boolean }) {
  const recipes = useAppState((s) => s.workspaces[ws].recipes);
  return (
    <ul className="paper divide-y divide-rule rounded-xl border border-line">
      {tasks.map((t) => {
        const recipe = t.recipeId ? recipes.find((r) => r.id === t.recipeId) : undefined;
        return (
          <li key={t.id} className="flex items-start gap-3 px-2 py-2">
            <button
              type="button"
              role="checkbox"
              aria-checked={t.done}
              aria-label={`${t.done ? "Mark not done" : "Mark done"}: ${t.title}`}
              onClick={() => act((s) => ops.togglePrep(s, ws, t.id))}
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 text-2xl font-black ${t.done ? "border-ok bg-ok text-white" : "border-ink/60 bg-surface"}`}
            >
              {t.done ? "✓" : ""}
            </button>
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onEdit(t)} aria-label={`Edit ${t.title}`}>
              <span className={`block text-base font-semibold ${t.done ? "text-muted line-through" : ""}`}>{t.title}</span>
              <span className="mt-0.5 flex flex-wrap gap-1 text-xs">
                {showDate && <Badge>{formatShort(t.date)}</Badge>}
                {t.startTime && <Badge tone="accent">⏱ {t.startTime}</Badge>}
                {t.meal && <Badge>{MEAL_LABELS[t.meal]}</Badge>}
                {t.source === "suggested" && <Badge>suggested</Badge>}
                {t.target && t.target.date > t.date && t.target.stage === "make" && (
                  <Badge tone="accent">
                    {t.done ? "made ahead" : "ahead"} for {formatShort(t.target.date)} {MEAL_LABELS[t.target.meal].toLowerCase()}
                  </Badge>
                )}
              </span>
              {t.holdingReminder && <span className="mt-0.5 block text-xs text-muted">🧊 {t.holdingReminder}</span>}
              {t.notes && <span className="mt-0.5 block text-sm text-muted">{t.notes}</span>}
            </button>
            {recipe && (
              <Link
                href={`${WORKSPACES[ws].nav.find((n) => n.label === "Recipes")?.href ?? "/"}?r=${recipe.id}`}
                className="flex min-h-11 shrink-0 items-center rounded-xl border border-ok/40 bg-ok-soft px-2 text-xs font-bold text-ok"
                aria-label={`Open recipe: ${recipe.name}`}
              >
                📖 Recipe
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Suggestions({ ws, items }: { ws: WorkspaceId; items: P.PrepSuggestion[] }) {
  return (
    <div className="mt-3 rounded-xl border-2 border-dashed border-line p-2">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-sm font-bold text-muted">Suggested from the menu</p>
        <Button size="sm" variant="ghost" onClick={() => act((s) => items.reduce((acc, it) => ops.acceptSuggestion(acc, ws, it), s), `Added ${items.length} task(s)`)}>
          Add all
        </Button>
      </div>
      <ul className="space-y-1">
        {items.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 text-sm">
              <span className="font-semibold">{s.title}</span> <span className="text-muted">· {MEAL_LABELS[s.meal]}{s.reason ? ` · ${s.reason}` : ""}</span>
            </span>
            <Button size="sm" variant="outline" onClick={() => act((st) => ops.acceptSuggestion(st, ws, s))} aria-label={`Add ${s.title}`}>
              Add
            </Button>
            <button type="button" className="px-2 text-sm text-muted underline" onClick={() => act((st) => ops.dismissSuggestion(st, ws, s.key))} aria-label={`Dismiss ${s.title}`}>
              Skip
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Templates({ ws, date, withMeals }: { ws: WorkspaceId; date: ISODate; withMeals: boolean }) {
  const templates = useAppState((s) => s.workspaces[ws].templates);
  const todays = useAppState((s) => s.workspaces[ws].prep);
  const [tpl, setTpl] = useState("");
  const [meal, setMeal] = useState<MealService | "">("");
  const [name, setName] = useState("");
  const today = todays.filter((t) => t.date === date);
  return (
    <Card title="Prep templates">
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <select className={`${inputCls} flex-1`} value={tpl} onChange={(e) => setTpl(e.target.value)} aria-label="Template">
            <option value="">Choose a template…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.tasks.length})
              </option>
            ))}
          </select>
          {withMeals && (
            <select className={`${inputCls} w-36`} value={meal} onChange={(e) => setMeal(e.target.value as MealService | "")} aria-label="Template meal">
              <option value="">Any meal</option>
              {MEAL_SERVICES.map((m) => (
                <option key={m} value={m}>
                  {MEAL_LABELS[m]}
                </option>
              ))}
            </select>
          )}
        </div>
        <Button className="w-full" variant="outline" disabled={!tpl} onClick={() => act((s) => ops.applyPrepTemplate(s, ws, tpl, date, meal || null), "Template added to today")}>
          Add template tasks to today
        </Button>
        {today.length > 0 && (
          <form
            className="flex gap-2 pt-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (act((s) => ops.saveTemplate(s, ws, name, today.map((t) => t.title)), "Template saved")) setName("");
            }}
          >
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Save today's list as…" aria-label="New template name" />
            <Button type="submit" variant="outline" disabled={!name.trim()}>
              Save
            </Button>
          </form>
        )}
      </div>
    </Card>
  );
}

function TaskSheet({
  ws,
  task,
  open,
  defaultDate,
  withMeals,
  onClose,
}: {
  ws: WorkspaceId;
  task: P.PrepTask | null;
  open: boolean;
  defaultDate: ISODate;
  withMeals: boolean;
  onClose: () => void;
}) {
  const recipes = useAppState((s) => s.workspaces[ws].recipes);
  return (
    <Sheet open={open} onClose={onClose} title={task ? "Edit task" : "New prep task"}>
      {open && <TaskForm key={task?.id ?? `new-${defaultDate}`} ws={ws} task={task} defaultDate={defaultDate} withMeals={withMeals} recipes={recipes} onDone={onClose} />}
    </Sheet>
  );
}

function TaskForm({
  ws,
  task,
  defaultDate,
  withMeals,
  recipes,
  onDone,
}: {
  ws: WorkspaceId;
  task: P.PrepTask | null;
  defaultDate: ISODate;
  withMeals: boolean;
  recipes: { id: string; name: string }[];
  onDone: () => void;
}) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [date, setDate] = useState(task?.date ?? defaultDate);
  const [meal, setMeal] = useState<MealService | "">(task?.meal ?? "");
  const [startTime, setStartTime] = useState(task?.startTime ?? "");
  const [holding, setHolding] = useState(task?.holdingReminder ?? "");
  const [notes, setNotes] = useState(task?.notes ?? "");
  const [recipeId, setRecipeId] = useState(task?.recipeId ?? "");
  const save = () => {
    const fields = { title, date, meal: meal || null, startTime, holdingReminder: holding, notes, ...(recipeId ? { recipeId } : {}) };
    const ok = task
      ? act((s) =>
          ops.updatePrepTask(s, ws, task.id, (t) => {
            const { recipeId: _r, ...rest } = t;
            const check = P.createTask({ ...fields }); // validates
            return { ...rest, ...fields, title: check.title, startTime: check.startTime };
          }),
        )
      : act((s) => ops.addPrepTask(s, ws, fields), "Task added");
    if (ok) onDone();
  };
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <Field label="Task">
        <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Make Jello" />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Date">
          <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Start time">
          <input type="time" className={inputCls} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </Field>
      </div>
      {withMeals && (
        <Field label="Meal">
          <select className={inputCls} value={meal} onChange={(e) => setMeal(e.target.value as MealService | "")}>
            <option value="">—</option>
            {MEAL_SERVICES.map((m) => (
              <option key={m} value={m}>
                {MEAL_LABELS[m]}
              </option>
            ))}
          </select>
        </Field>
      )}
      <Field label="Storage / holding reminder" hint="Use your facility's approved standards.">
        <input className={inputCls} value={holding} onChange={(e) => setHolding(e.target.value)} placeholder="Label & date; keep refrigerated" />
      </Field>
      <Field label="Linked recipe">
        <select className={inputCls} value={recipeId} onChange={(e) => setRecipeId(e.target.value)}>
          <option value="">None</option>
          {recipes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </Field>
      {recipeId && (
        <Link className="text-sm font-semibold text-primary underline" href={`${WORKSPACES[ws].nav.find((n) => n.label === "Recipes")?.href ?? "/"}?r=${recipeId}`}>
          Open recipe
        </Link>
      )}
      <Field label="Notes">
        <textarea className={`${inputCls} min-h-20 py-2`} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" size="lg" className="flex-1">
          {task ? "Save" : "Add task"}
        </Button>
        {task && (
          <Button
            variant="danger"
            size="lg"
            onClick={() => {
              if (window.confirm(`Delete “${task.title}”?`) && act((s) => ops.deletePrepTask(s, ws, task.id))) onDone();
            }}
          >
            Delete
          </Button>
        )}
      </div>
    </form>
  );
}
