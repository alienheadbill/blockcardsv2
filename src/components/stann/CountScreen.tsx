"use client";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import * as C from "@/lib/counting";
import { demoStack } from "@/lib/demo/slips";
import { MEAL_LABELS, type MealService } from "@/lib/menu/types";
import * as ops from "@/lib/state/ops";
import { useAppState } from "@/lib/state/store";
import { DateBar, MealTabs, useDateMeal } from "../DateMealBar";
import { useProfile } from "../useProfile";
import { pickMeal } from "@/lib/profiles";
import { Icon } from "../Icon";
import { MenuList, positionLabel } from "../MenuList";
import { TallyMarks } from "../TallyMarks";
import { act, Badge, Banner, Button, Card, Field, inputCls, Sheet, toast } from "../ui";
import { PromptSheet, RequestsPanel } from "./RequestsPanel";
import { ServiceFlow } from "./ServiceFlow";

/** Short vibration on supported phones (Android). iPhone Safari has no vibration API, so this is a no-op there. */
const vibrate = () => {
  try {
    navigator.vibrate?.(12);
  } catch {
    /* not supported */
  }
};

export function CountScreen() {
  const profile = useProfile("stann");
  const { date, meal, set } = useDateMeal(pickMeal(profile));
  const state = useAppState((s) => s);
  const resolved = useMemo(() => ops.mealFor(state, date, meal), [state, date, meal]);
  const session = state.workspaces.stann.counts[C.sessionKey(date, meal)];
  const settings = state.workspaces.stann.settings;

  return (
    <div className="space-y-3">
      <DateBar date={date} onChange={(d) => set({ date: d })} subtitle={positionLabel(resolved)} />
      <MealTabs meal={meal} meals={profile.meals} onChange={(m) => set({ meal: m })} />
      {!(state.workspaces.stann.settings.compactCounting && session) && <ServiceFlow date={date} meal={meal} current="count" />}
      {session ? (
        <ActiveCount
          session={session}
          showTally={settings.showTallyMarks}
          showSides={settings.countMenuSides ?? false}
          positionText={positionLabel(resolved)}
          menuChanged={resolved.source === "override"}
        />
      ) : (
        <StartCount date={date} meal={meal} resolved={resolved} />
      )}
    </div>
  );
}

function StartCount({ date, meal, resolved }: { date: string; meal: MealService; resolved: ReturnType<typeof ops.mealFor> }) {
  const menuNames = resolved.items.filter((i) => i.kind === "main" || i.kind === "alt").map((i) => C.shortEntreeName(i.text));
  return <StartForm key={`${date}-${meal}-${menuNames.join("|")}`} date={date} meal={meal} resolved={resolved} menuNames={menuNames} />;
}

function StartForm({ date, meal, resolved, menuNames }: { date: string; meal: MealService; resolved: ReturnType<typeof ops.mealFor>; menuNames: string[] }) {
  const units = useAppState((s) => s.workspaces.stann.settings.units ?? []);
  const [names, setNames] = useState<string[]>(menuNames.length ? menuNames : ["", ""]);
  const filled = names.filter((n) => n.trim());
  return (
    <Card title={`${MEAL_LABELS[meal]}${resolved.position ? ` · ${positionLabel(resolved)}` : ""}`}>
      {resolved.source === "override" && (
        <div className="mb-2">
          <Banner tone="info">Menu changed for this date: {resolved.overrideReason}</Banner>
        </div>
      )}
      {resolved.items.length > 0 ? (
        <details open className="mb-3 rounded-xl bg-surface-2 p-2">
          <summary className="cursor-pointer text-sm font-semibold text-muted">Today&apos;s printed menu</summary>
          <div className="mt-2">
            <MenuList items={resolved.items} compact />
          </div>
        </details>
      ) : (
        <p className="mb-3 text-sm text-muted">No printed menu for this date — just write your boxes.</p>
      )}
      <p className="mb-2 text-sm font-bold">Write your tally boxes</p>
      <div className="paper space-y-2 rounded-xl border border-line p-2">
        {names.map((n, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              className={`${inputCls} font-[family-name:var(--font-hand)] text-lg font-bold`}
              value={n}
              onChange={(e) => setNames((x) => x.map((y, j) => (j === i ? e.target.value : y)))}
              placeholder={i === 0 ? "e.g. Veg Frittata" : "e.g. Chicken Pot Pie"}
              aria-label={`Tally box ${i + 1}`}
              autoComplete="off"
            />
            {names.length > 1 && (
              <button type="button" className="p-2 text-muted" aria-label={`Remove box ${i + 1}`} onClick={() => setNames((x) => x.filter((_, j) => j !== i))}>
                <Icon name="x" />
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <Button size="sm" variant="ghost" onClick={() => setNames((x) => [...x, ""])}>
          + Another box
        </Button>
        {menuNames.length > 0 && names.join("|") !== menuNames.join("|") && (
          <Button size="sm" variant="ghost" onClick={() => setNames(menuNames)}>
            Use menu names
          </Button>
        )}
      </div>
      <div className="mt-3 space-y-3">
        {units.length > 0 && <p className="text-sm text-muted">You&apos;ll count each unit&apos;s stack in turn: {units.join(", ")}.</p>}
        <Button size="lg" className="w-full" disabled={!filled.length} onClick={() => act((s) => ops.startSession(s, date, meal, names))}>
          <Icon name="tally" /> Start counting {MEAL_LABELS[meal].toLowerCase()}
        </Button>
      </div>
    </Card>
  );
}

function ActiveCount({
  session,
  showTally,
  showSides,
  positionText,
  menuChanged,
}: {
  session: C.CountSession;
  showTally: boolean;
  showSides: boolean;
  positionText: string;
  menuChanged: boolean;
}) {
  const { date, meal } = session;
  const summary = useMemo(() => C.summarize(session), [session]);
  const requests = useAppState((s) => s.workspaces.stann.requests);
  const reqCount = useMemo(
    () => requests.filter((r) => r.date === date && r.meal === meal && r.status !== "cancelled").reduce((n, r) => n + r.quantity, 0),
    [requests, date, meal],
  );
  const [reviewOpen, setReviewOpen] = useState(false);
  const [correctOpen, setCorrectOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [practice, setPractice] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [renaming, setRenaming] = useState<C.CountOption | null>(null);
  const [addingBox, setAddingBox] = useState(false);
  const locked = session.status === "complete";
  const entrees = session.options.filter((o) => o.role === "main" || o.role === "alt");
  const special = session.options.filter((o) => o.role === "custom" || o.role === "unresolved");
  const last = C.lastUndoable(session);
  const update = (fn: (s: C.CountSession) => C.CountSession, log?: { action: string; detail: string }) => act((st) => ops.updateSession(st, date, meal, fn, log));

  const settings = useAppState((s) => s.workspaces.stann.settings);
  const compact = settings.compactCounting ?? false;
  const buzz = () => (settings.hapticFeedback ?? true) && vibrate();
  const lastTap = useRef<{ key: string; at: number } | null>(null);
  const [ignoredAt, setIgnoredAt] = useState(0);
  const tap = (key: string) => {
    const now = performance.now();
    // Bounced / double taps on the same box are ignored; taps on different boxes never are.
    if (C.isDuplicateTap(lastTap.current, key, now, settings.tapGuardMs ?? 300)) {
      setIgnoredAt(now);
      return;
    }
    lastTap.current = { key, at: now };
    if (ignoredAt) setIgnoredAt(0);
    if (update((s) => C.tapSlip(s, key))) buzz();
  };
  const tapItem = (key: string) => {
    const slipId = session.mode === "detailed" ? summary.lastSlipId ?? undefined : undefined;
    if (update((s) => C.tapItem(s, key, slipId))) buzz();
  };

  // detailed mode: add-ons already recorded for the most recent slip
  const lastSlipItems = useMemo(() => {
    if (session.mode !== "detailed" || !summary.lastSlipId) return new Map<string, number>();
    const undone = C.undoneIds(session);
    const m = new Map<string, number>();
    for (const e of session.events) if (e.type === "item" && e.slipId === summary.lastSlipId && !undone.has(e.id)) m.set(e.itemKey, (m.get(e.itemKey) ?? 0) + 1);
    return m;
  }, [session, summary.lastSlipId]);

  const units = session.units ?? [];
  const activeUnit = session.activeUnit ?? null;
  const stack = useMemo(() => (practice ? demoStack(session, session.expectedSlips ?? 45) : []), [practice, session]);
  const currentSlip = stack[summary.slipsProcessed];
  // Modifications (no bun, no biscuit…) are custom extras; menu sides only show when the setting is on.
  const visibleExtras = session.extras.filter((x) => showSides || x.key.startsWith("x_"));
  const modSuggestions = useMemo(() => C.modificationSuggestions(session), [session]);
  const addMod = (label: string) => {
    if (
      update((s) => {
        const withExtra = C.addExtra(s, label);
        return C.tapItem(withExtra, withExtra.extras[withExtra.extras.length - 1]!.key, session.mode === "detailed" ? summary.lastSlipId ?? undefined : undefined);
      })
    )
      buzz();
  };

  return (
    <div className="space-y-3 pb-20">
      {/* Summary strip */}
      <div className={`rounded-2xl bg-primary text-primary-ink shadow ${compact ? "p-2" : "p-3"}`}>
        {compact ? (
          <div className="flex items-center justify-between gap-2" aria-live="polite">
            <p className="text-sm font-semibold">
              <span className="text-2xl font-extrabold tabular-nums" data-testid="total-meals">
                {summary.totalMeals}
              </span>{" "}
              meals
              {summary.unresolved > 0 && <span className="ml-2 rounded bg-warn-soft px-1 text-warn">{summary.unresolved} unclear</span>}
              {reqCount > 0 && <span className="ml-2 opacity-90">· {reqCount} req</span>}
            </p>
            {locked ? <Badge tone="ok">Complete ✓</Badge> : <Badge tone="accent">Counting</Badge>}
          </div>
        ) : (
        <>
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold opacity-90">
            {positionText} · {MEAL_LABELS[meal]}
          </p>
          {locked ? <Badge tone="ok">Count complete</Badge> : <Badge tone="accent">Counting</Badge>}
        </div>
        <div className="mt-2 grid grid-cols-4 gap-2 text-center">
          <Stat label="Meals" value={summary.totalMeals} big testId="total-meals" />
          <Stat label="Requests" value={reqCount} />
          <Stat label="Unclear" value={summary.unresolved} warn={summary.unresolved > 0} />
          {activeUnit ? (
            <Stat label={activeUnit} value={summary.byUnit[activeUnit]?.total ?? 0} />
          ) : (
            session.expectedSlips != null ? (
              <Stat label="In stack" value={session.expectedSlips} warn={summary.discrepancy !== null && summary.discrepancy < 0} />
            ) : (
              <Stat label="Mods" value={session.extras.filter((x) => x.key.startsWith("x_")).reduce((n, x) => n + (summary.items[x.key] ?? 0), 0)} />
            )
          )}
        </div>
        </>
        )}
      </div>

      {menuChanged && <Banner tone="info">The menu for this date was changed. Tap ✎ on a box to rewrite its name if needed.</Banner>}

      {locked ? (
        <Banner tone="info">
          This count was reviewed and marked complete. Taps are locked.{" "}
          <Link href={`/stann/production?date=${date}&meal=${meal}`} className="font-bold underline">
            Next: work out production →
          </Link>{" "}
          <button type="button" className="font-bold underline" onClick={() => setReopenOpen(true)}>
            Reopen with a reason
          </button>
        </Banner>
      ) : (
        <div className="flex items-center gap-2">
          <div role="radiogroup" aria-label="Counting mode" className="grid flex-1 grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
            {(["quick", "detailed"] as const).map((m) => (
              <button
                key={m}
                role="radio"
                aria-checked={session.mode === m}
                type="button"
                onClick={() => update((s) => C.setMode(s, m))}
                className={`min-h-10 rounded-lg text-sm font-bold ${session.mode === m ? "bg-surface shadow" : "text-muted"}`}
              >
                {m === "quick" ? "Quick count" : "Detailed"}
              </button>
            ))}
          </div>
          <Button
            size="sm"
            variant={compact ? "accent" : "outline"}
            aria-pressed={compact}
            onClick={() => act((st) => ({ ...st, workspaces: { ...st.workspaces, stann: { ...st.workspaces.stann, settings: { ...st.workspaces.stann.settings, compactCounting: !compact } } } }))}
          >
            Compact
          </Button>
          <Button size="sm" variant={practice ? "accent" : "outline"} onClick={() => setPractice((p) => !p)} aria-pressed={practice}>
            Practice
          </Button>
        </div>
      )}

      {practice && !locked && (
        <div className="rounded-xl border-2 border-dashed border-accent bg-[#d8f3ef] p-3 text-[#16302c]" aria-live="polite">
          {currentSlip ? (
            <>
              <p className="text-xs font-bold uppercase tracking-wide">
                Demo slip {currentSlip.n} of {stack.length} · fictional
              </p>
              <p className="text-base font-bold">
                Room: {currentSlip.room}
                {activeUnit ? ` · ${activeUnit}` : ""}
              </p>
              <p className="mt-1 text-base">
                ◯ <strong>{currentSlip.choiceLabel}</strong>
              </p>
              {currentSlip.extras.length > 0 && <p className="text-sm">◯ {currentSlip.extras.map((x) => x.label).join(" · ")}</p>}
            </>
          ) : (
            <p className="font-bold">Practice stack finished — {stack.length} slips. Review and finish the count below.</p>
          )}
        </div>
      )}

      {units.length > 0 && !locked && (
        <div role="radiogroup" aria-label="Unit stack" className="grid gap-1 rounded-xl bg-surface-2 p-1" style={{ gridTemplateColumns: `repeat(${units.length}, minmax(0, 1fr))` }}>
          {units.map((u) => (
            <button
              key={u}
              type="button"
              role="radio"
              aria-checked={activeUnit === u}
              onClick={() => update((s) => C.setActiveUnit(s, u))}
              className={`min-h-12 rounded-lg px-1 text-sm font-bold leading-tight ${activeUnit === u ? "bg-accent text-accent-ink shadow" : "text-muted"}`}
            >
              {u}
              <span className="block text-xs font-semibold tabular-nums opacity-80">{summary.byUnit[u]?.total ?? 0} slips</span>
            </button>
          ))}
        </div>
      )}

      {ignoredAt > 0 && (
        <p key={ignoredAt} role="status" className="text-center text-xs font-semibold text-muted">
          Double tap on the same box ignored — tap again if that was a second slip.
        </p>
      )}

      {/* Main tally panels — the two-column notebook */}
      <div className={`grid gap-3 ${entrees.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
        {entrees.map((o) => (
          <div key={o.key} className="relative">
          <button
            type="button"
            disabled={locked}
            onClick={() => tap(o.key)}
            aria-label={`Count one ${o.label}. Now ${summary.byChoice[o.key] ?? 0}.`}
            className={`paper flex h-full w-full flex-col rounded-2xl border-2 border-ink/70 p-3 pt-4 text-left shadow-sm transition active:scale-[0.97] active:bg-accent-soft disabled:opacity-70 ${compact ? "min-h-28" : "min-h-44"}`}
          >
            <span className="line-clamp-3 border-b-2 border-ink/60 pb-1 pr-8 font-[family-name:var(--font-hand)] text-lg font-bold leading-snug">{o.label}</span>
            <span className="mt-2 flex-1">{showTally && !compact && <TallyMarks count={summary.byChoice[o.key] ?? 0} />}</span>
            <span className="mt-2 self-center rounded-lg border-2 border-ink px-4 text-4xl font-extrabold tabular-nums" data-testid={`count-${o.role}`}>
              {summary.byChoice[o.key] ?? 0}
            </span>
          </button>
          {!locked && (
            <button
              type="button"
              onClick={() => setRenaming(o)}
              aria-label={`Rename ${o.label}`}
              className="absolute right-1.5 top-1.5 flex h-10 w-10 items-center justify-center rounded-full bg-surface/90 text-muted shadow-sm"
            >
              <Icon name="edit" className="h-5 w-5" />
            </button>
          )}
          </div>
        ))}
      </div>
      {!locked && (
        <Button variant="ghost" size="sm" onClick={() => setAddingBox(true)}>
          + Add a tally box
        </Button>
      )}

      <div className="grid grid-cols-2 gap-3">
        {special.map((o) => (
          <button
            key={o.key}
            type="button"
            disabled={locked}
            onClick={() => tap(o.key)}
            aria-label={`Count one ${o.label}. Now ${summary.byChoice[o.key] ?? 0}.`}
            className={`flex min-h-16 items-center justify-between rounded-xl border-2 px-3 text-left font-bold active:scale-[0.97] disabled:opacity-60 ${
              o.role === "unresolved" ? "border-warn/50 bg-warn-soft" : "border-line bg-surface"
            }`}
          >
            <span className="text-sm leading-tight">{o.label}</span>
            <span className="text-2xl tabular-nums">{summary.byChoice[o.key] ?? 0}</span>
          </button>
        ))}
      </div>

      {summary.unresolved > 0 && (
        <UnresolvedList session={session} ids={summary.unresolvedSlipIds} disabled={locked} onResolve={(slipId, choice) => update((s) => C.resolveSlip(s, slipId, choice))} />
      )}

      {/* Additional items */}
      {(visibleExtras.length > 0 || modSuggestions.length > 0 || !locked) && (
        <Card
          title={showSides ? (session.mode === "detailed" ? "Add-ons for this slip" : "Additional items") : "Modifications"}
          action={<span className="text-xs font-semibold text-muted">Doesn&apos;t change meal total</span>}
        >
          {session.mode === "detailed" && (
            <p className="mb-2 text-sm text-muted">{summary.lastSlipId ? "Tap what's circled on the slip you just counted, then tap the next slip's meal." : "Count a meal first, then add its items."}</p>
          )}
          {!showSides && visibleExtras.length === 0 && <p className="mb-2 text-sm text-muted">For slips like “no bun” or “no biscuit”. Tap one below to start counting it.</p>}
          <div className="grid grid-cols-2 gap-2">
            {visibleExtras.map((x) => (
              <button
                key={x.key}
                type="button"
                disabled={locked || (session.mode === "detailed" && !summary.lastSlipId)}
                onClick={() => tapItem(x.key)}
                aria-label={`Add one ${x.label}. Now ${summary.items[x.key] ?? 0}.`}
                className="flex min-h-14 items-center justify-between gap-2 rounded-xl border-2 border-line bg-surface px-3 text-left active:scale-[0.97] disabled:opacity-50"
              >
                <span className="text-sm font-semibold leading-tight">
                  {x.label}
                  {session.mode === "detailed" && lastSlipItems.get(x.key) ? <span className="ml-1 text-ok">✓</span> : null}
                </span>
                <span className="text-xl font-bold tabular-nums">{summary.items[x.key] ?? 0}</span>
              </button>
            ))}
          </div>
          {!locked && modSuggestions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {modSuggestions.map((m) => (
                <button key={m} type="button" onClick={() => addMod(m)} className="min-h-10 rounded-full border-2 border-dashed border-line px-3 text-sm font-semibold active:bg-surface-2">
                  + {m}
                </button>
              ))}
            </div>
          )}
          {!locked && <AddExtra onAdd={(label) => update((s) => C.addExtra(s, label))} />}
        </Card>
      )}

      <RequestsPanel date={date} meal={meal} countSessionId={session.id} />

      <NotesCard key={session.id} initial={session.notes ?? ""} onSave={(v) => update((s) => C.setNotes(s, v))} />

      <Card title="Count tools">
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={locked} onClick={() => setCorrectOpen(true)}>
            Manual correction
          </Button>
          <ExpectedButton session={session} disabled={locked} onSet={(n) => update((s) => C.setExpected(s, n))} />
          <Button size="sm" variant="ghost" onClick={() => setLogOpen((v) => !v)} aria-expanded={logOpen}>
            {logOpen ? "Hide" : "Show"} tap log ({session.events.length})
          </Button>
        </div>
        {logOpen && <EventLog session={session} />}
      </Card>

      {/* Sticky action bar above bottom nav */}
      <div className="no-print hide-when-typing fixed inset-x-0 bottom-16 z-30 mb-[env(safe-area-inset-bottom)] px-4">
        <div className="mx-auto flex max-w-3xl gap-2 rounded-2xl border border-line bg-surface/95 p-2 shadow-lg backdrop-blur">
          <Button
            variant="outline"
            size="lg"
            className="flex-1"
            disabled={locked || !last}
            onClick={() => {
              const label = last ? describe(session, last) : "";
              if (update(C.undo)) toast(`Undid: ${label}`);
            }}
          >
            <Icon name="undo" /> Undo
          </Button>
          <Button size="lg" variant="accent" className="flex-[1.4]" disabled={locked} onClick={() => setReviewOpen(true)}>
            Review & finish
          </Button>
        </div>
      </div>

      <PromptSheet
        key={renaming?.key ?? "none"}
        open={!!renaming}
        title="Rename tally box"
        label="Name"
        initial={renaming?.label ?? ""}
        help="Counts stay with the box."
        confirm="Save name"
        onClose={() => setRenaming(null)}
        onSubmit={(v) => !!renaming && update((s) => C.renameOption(s, renaming.key, v))}
        extra={
          renaming && (summary.byChoice[renaming.key] ?? 0) === 0 ? (
            <Button
              variant="ghost"
              className="w-full text-danger"
              onClick={() => {
                if (update((s) => C.removeOption(s, renaming.key))) setRenaming(null);
              }}
            >
              Remove this box
            </Button>
          ) : null
        }
      />
      <PromptSheet
        open={addingBox}
        title="Add a tally box"
        label="Name"
        confirm="Add box"
        onClose={() => setAddingBox(false)}
        onSubmit={(v) => update((s) => C.addOption(s, v))}
      />
      <ReviewSheet open={reviewOpen} onClose={() => setReviewOpen(false)} session={session} requestTotal={reqCount} />
      <CorrectionSheet open={correctOpen} onClose={() => setCorrectOpen(false)} session={session} />
      <PromptSheet
        open={reopenOpen}
        title="Reopen this count"
        label="Reason"
        help="e.g. late slip from the 2nd floor. The reason is kept in the audit log."
        confirm="Reopen count"
        onClose={() => setReopenOpen(false)}
        onSubmit={(v) => update((s) => C.reopen(s, v), { action: "count.reopen", detail: `${date} ${meal}: ${v}` })}
      />
    </div>
  );
}

function Stat({ label, value, big, warn, testId }: { label: string; value: number | string; big?: boolean; warn?: boolean; testId?: string }) {
  return (
    <div className={`rounded-xl px-1 py-1 ${warn ? "bg-warn-soft text-warn" : "bg-white/10"}`}>
      <div className={`${big ? "text-3xl" : "text-2xl"} font-extrabold tabular-nums`} data-testid={testId}>
        {value}
      </div>
      <div className="text-[11px] font-semibold uppercase tracking-wide opacity-90">{label}</div>
    </div>
  );
}

function describe(session: C.CountSession, e: C.CountEvent): string {
  switch (e.type) {
    case "slip":
      return C.labelFor(session, e.choice);
    case "item":
      return C.labelFor(session, e.itemKey);
    case "resolve":
      return `resolved slip → ${C.labelFor(session, e.choice)}`;
    case "correction":
      return `correction ${e.delta > 0 ? "+" : ""}${e.delta} ${C.labelFor(session, e.target.kind === "slip" ? e.target.choice : e.target.itemKey)}`;
    case "undo":
      return "undo";
    case "complete":
      return "marked complete";
    case "reopen":
      return `reopened: ${e.reason}`;
  }
}

function EventLog({ session }: { session: C.CountSession }) {
  const undone = C.undoneIds(session);
  return (
    <ol className="mt-3 max-h-72 space-y-1 overflow-y-auto text-sm" aria-label="Tap log">
      {[...session.events].reverse().map((e) => (
        <li key={e.id} className={`flex justify-between gap-2 border-b border-line py-1 ${undone.has(e.id) ? "text-muted line-through" : ""}`}>
          <span>
            #{e.seq} {e.type === "undo" ? `undo #${session.events.find((x) => x.id === e.targetId)?.seq}` : describe(session, e)}
            {e.type === "correction" && <em className="text-muted"> — {e.reason}</em>}
          </span>
          <time className="shrink-0 text-muted">{new Date(e.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}</time>
        </li>
      ))}
    </ol>
  );
}

function UnresolvedList({ session, ids, disabled, onResolve }: { session: C.CountSession; ids: string[]; disabled: boolean; onResolve: (slipId: string, choice: string) => void }) {
  const entrees = session.options.filter((o) => o.role !== "unresolved");
  return (
    <Card title="Unclear slips">
      <p className="mb-2 text-sm text-muted">Check with the nurse or dietary staff, then pick the meal for each slip.</p>
      <ul className="space-y-2">
        {ids.map((id) => {
          const seq = session.events.find((e) => e.id === id)?.seq;
          return (
            <li key={id} className="rounded-xl bg-warn-soft p-2">
              <p className="mb-1 text-sm font-bold">Slip tap #{seq}</p>
              <div className="flex flex-wrap gap-2">
                {entrees.map((o) => (
                  <Button key={o.key} size="sm" variant="outline" disabled={disabled} onClick={() => onResolve(id, o.key)}>
                    {o.label.length > 22 ? `${o.label.slice(0, 22)}…` : o.label}
                  </Button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function AddExtra({ onAdd }: { onAdd: (label: string) => boolean }) {
  const [v, setV] = useState("");
  return (
    <form
      className="mt-3 flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (onAdd(v)) setV("");
      }}
    >
      <input className={inputCls} value={v} onChange={(e) => setV(e.target.value)} placeholder="Other (e.g. No onions – Burger)" aria-label="New item to track" />
      <Button type="submit" variant="outline" disabled={!v.trim()}>
        Add
      </Button>
    </form>
  );
}

function ExpectedButton({ session, disabled, onSet }: { session: C.CountSession; disabled: boolean; onSet: (n: number | null) => boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" disabled={disabled} onClick={() => setOpen(true)}>
        Slips in stack: {session.expectedSlips ?? "—"}
      </Button>
      <PromptSheet
        open={open}
        title="Slips in the stack"
        label="Number of slips (0 to clear)"
        confirm="Save"
        onClose={() => setOpen(false)}
        onSubmit={(v) => {
          const n = Number(v);
          return onSet(Number.isFinite(n) && n > 0 ? Math.round(n) : null);
        }}
      />
    </>
  );
}

function CorrectionSheet({ open, onClose, session }: { open: boolean; onClose: () => void; session: C.CountSession }) {
  const targets = [
    ...session.options.map((o) => ({ value: `slip:${o.key}`, label: `Meal — ${o.label}` })),
    ...session.extras.map((x) => ({ value: `item:${x.key}`, label: `Item — ${x.label}` })),
  ];
  const [target, setTarget] = useState(targets[0]?.value ?? "");
  const [delta, setDelta] = useState(1);
  const [reason, setReason] = useState("");
  const submit = () => {
    const [kind, key] = [target.slice(0, target.indexOf(":")), target.slice(target.indexOf(":") + 1)];
    const t = kind === "slip" ? ({ kind: "slip", choice: key } as const) : ({ kind: "item", itemKey: key } as const);
    const ok = act(
      (s) => ops.updateSession(s, session.date, session.meal, (x) => C.correct(x, t, delta, reason), { action: "count.correct", detail: `${delta > 0 ? "+" : ""}${delta} ${C.labelFor(session, key)}: ${reason}` }),
      "Correction recorded",
    );
    if (ok) {
      setReason("");
      setDelta(1);
      onClose();
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Manual correction">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <p className="text-sm text-muted">Use this for slips found later or miscounts discovered after the fact. Every correction is time-stamped with your reason.</p>
        <Field label="What to correct">
          <select className={inputCls} value={target} onChange={(e) => setTarget(e.target.value)}>
            {targets.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Change by">
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setDelta((d) => (d - 1 === 0 ? -1 : d - 1))} aria-label="Decrease">
              −
            </Button>
            <span className="w-14 text-center text-2xl font-bold tabular-nums" aria-live="polite">
              {delta > 0 ? `+${delta}` : delta}
            </span>
            <Button variant="outline" onClick={() => setDelta((d) => (d + 1 === 0 ? 1 : d + 1))} aria-label="Increase">
              +
            </Button>
          </div>
        </Field>
        <Field label="Reason (required)">
          <input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="2 slips found under the tray" />
        </Field>
        <Button type="submit" size="lg" className="w-full" disabled={!reason.trim()}>
          Record correction
        </Button>
      </form>
    </Sheet>
  );
}

function ReviewSheet({ open, onClose, session, requestTotal }: { open: boolean; onClose: () => void; session: C.CountSession; requestTotal: number }) {
  const summary = C.summarize(session);
  const issues = C.reviewIssues(session);
  const [acks, setAcks] = useState<string[]>([]);
  const blocking = issues.some((i) => i.blocking);
  const allAcked = issues.filter((i) => !i.blocking).every((i) => acks.includes(i.id));
  return (
    <Sheet open={open} onClose={onClose} title="Review count">
      <table className="w-full text-base">
        <tbody>
          {session.options
            .filter((o) => (summary.byChoice[o.key] ?? 0) > 0 || o.role === "main" || o.role === "alt")
            .map((o) => (
              <tr key={o.key} className="border-b border-line">
                <td className="py-1.5 pr-2">{o.label}</td>
                <td className="py-1.5 text-right text-xl font-bold tabular-nums">{summary.byChoice[o.key] ?? 0}</td>
              </tr>
            ))}
          <tr className="border-b-2 border-ink">
            <td className="py-2 font-extrabold">Total resident meals</td>
            <td className="py-2 text-right text-2xl font-extrabold tabular-nums">{summary.totalMeals}</td>
          </tr>
          {session.extras
            .filter((x) => (summary.items[x.key] ?? 0) > 0)
            .map((x) => (
              <tr key={x.key} className="border-b border-line text-muted">
                <td className="py-1.5 pr-2">+ {x.label}</td>
                <td className="py-1.5 text-right font-bold tabular-nums">{summary.items[x.key]}</td>
              </tr>
            ))}
          {Object.entries(summary.byUnit)
            .filter(([, v]) => v.total > 0 || (session.units ?? []).length > 0)
            .map(([u, v]) => (
              <tr key={`unit-${u}`} className="border-b border-line text-muted">
                <td className="py-1.5 pr-2">{u || "No unit"}</td>
                <td className="py-1.5 text-right font-bold tabular-nums">{v.total}</td>
              </tr>
            ))}
          <tr>
            <td className="py-1.5 text-muted">Special requests (separate)</td>
            <td className="py-1.5 text-right font-bold tabular-nums text-muted">{requestTotal}</td>
          </tr>
        </tbody>
      </table>
      <div className="mt-4 space-y-2">
        {issues.length === 0 && <Banner tone="info">✓ No issues found.</Banner>}
        {issues.map((i) =>
          i.blocking ? (
            <Banner key={i.id} tone="danger">
              {i.message}
            </Banner>
          ) : (
            <label key={i.id} className="flex items-start gap-3 rounded-xl border border-warn/40 bg-warn-soft p-3 text-sm font-semibold text-warn">
              <input
                type="checkbox"
                className="mt-0.5 h-6 w-6 shrink-0"
                checked={acks.includes(i.id)}
                onChange={(e) => setAcks((a) => (e.target.checked ? [...a, i.id] : a.filter((x) => x !== i.id)))}
              />
              <span>
                {i.message} <span className="font-normal">I&apos;ve checked this.</span>
              </span>
            </label>
          ),
        )}
      </div>
      <Button
        size="lg"
        className="mt-4 w-full"
        disabled={blocking || !allAcked}
        onClick={() => {
          if (
            act(
              (s) => ops.updateSession(s, session.date, session.meal, (x) => C.complete(x, acks), { action: "count.complete", detail: `${session.date} ${session.meal}: ${summary.totalMeals} meals` }),
              "Count marked complete",
            )
          )
            onClose();
        }}
      >
        Mark count complete
      </Button>
    </Sheet>
  );
}

function NotesCard({ initial, onSave }: { initial: string; onSave: (v: string) => boolean }) {
  const [value, setValue] = useState(initial);
  const dirty = value !== initial;
  return (
    <Card title="Notes" action={dirty ? <span className="text-xs font-semibold text-muted">saves when you tap away</span> : null}>
      <textarea
        className={`${inputCls} paper min-h-32 py-2 font-[family-name:var(--font-hand)] text-lg leading-8`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => dirty && onSave(value)}
        placeholder="Anything else for this meal — who wants what, what to pull, reminders…"
        aria-label="Notes for this meal"
      />
    </Card>
  );
}
