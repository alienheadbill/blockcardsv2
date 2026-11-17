"use client";
import { useState } from "react";
import { MEAL_LABELS, MEAL_SERVICES, type MealService } from "@/lib/menu/types";
import { PROFILE_PRESETS, profileFromPreset, type Profile } from "@/lib/profiles";
import * as ops from "@/lib/state/ops";
import { useAppState } from "@/lib/state/store";
import { WORKSPACES, type WorkspaceId } from "@/lib/workspaces";
import { act, Badge, Button, Field, inputCls, Sheet } from "./ui";

/** Pick who's cooking, and edit what each profile sees. */
export function ProfileSheet({ ws, open, onClose }: { ws: WorkspaceId; open: boolean; onClose: () => void }) {
  const data = useAppState((s) => s.workspaces[ws]);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [adding, setAdding] = useState(false);
  const close = () => {
    setEditing(null);
    setAdding(false);
    onClose();
  };
  const title = editing ? (data.profiles.some((p) => p.id === editing.id) ? `Edit ${editing.name}` : "New profile") : adding ? "New profile" : "Who's cooking?";

  return (
    <Sheet open={open} onClose={close} title={title}>
      {editing ? (
        <ProfileForm key={editing.id} ws={ws} profile={editing} isNew={!data.profiles.some((p) => p.id === editing.id)} onDone={() => setEditing(null)} />
      ) : adding ? (
        <div className="space-y-2">
          <p className="text-sm text-muted">Start from:</p>
          {PROFILE_PRESETS[ws].map((p) => (
            <button
              key={p.presetId}
              type="button"
              onClick={() => {
                setAdding(false);
                setEditing(profileFromPreset(p));
              }}
              className="w-full rounded-xl border-2 border-line p-3 text-left active:bg-surface-2"
            >
              <span className="block font-bold">
                {p.name} {p.shift && <span className="font-semibold text-muted">· {p.shift}</span>}
              </span>
              <span className="text-sm text-muted">{p.description}</span>
            </button>
          ))}
          <Button variant="ghost" onClick={() => setAdding(false)}>
            Back
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-muted">Profiles change what you see on this phone. Everyone shares the same kitchen data.</p>
          <ul className="space-y-2" role="radiogroup" aria-label="Profiles">
            {data.profiles.map((p) => {
              const active = p.id === data.activeProfileId;
              return (
                <li key={p.id} className={`flex items-center gap-2 rounded-xl border-2 p-2 ${active ? "border-primary bg-accent-soft/40" : "border-line"}`}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => act((s) => ops.setActiveProfile(s, ws, p.id)) && close()}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block text-base font-bold">
                      {active && "✓ "}
                      {p.name}
                    </span>
                    <span className="block text-sm text-muted">
                      {[p.shift, ws === "stann" ? mealsText(p.meals) : "", p.hiddenTabs.length ? `${p.hiddenTabs.length} tab(s) hidden` : ""].filter(Boolean).join(" · ") || "Everything"}
                    </span>
                  </button>
                  <Button size="sm" variant="outline" onClick={() => setEditing(p)} aria-label={`Edit ${p.name}`}>
                    Edit
                  </Button>
                </li>
              );
            })}
          </ul>
          <Button variant="ghost" onClick={() => setAdding(true)}>
            + New profile
          </Button>
        </div>
      )}
    </Sheet>
  );
}

function mealsText(meals: MealService[]) {
  return meals.length === MEAL_SERVICES.length ? "All meals" : meals.map((m) => MEAL_LABELS[m]).join(" & ");
}

function ProfileForm({ ws, profile, isNew, onDone }: { ws: WorkspaceId; profile: Profile; isNew: boolean; onDone: () => void }) {
  const [p, setP] = useState(profile);
  const nav = WORKSPACES[ws].nav;
  const toggleMeal = (m: MealService) => setP((x) => ({ ...x, meals: x.meals.includes(m) ? x.meals.filter((y) => y !== m) : [...x.meals, m] }));
  const toggleTab = (href: string) => setP((x) => ({ ...x, hiddenTabs: x.hiddenTabs.includes(href) ? x.hiddenTabs.filter((y) => y !== href) : [...x.hiddenTabs, href] }));
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (act((s) => (isNew ? ops.setActiveProfile(ops.saveProfile(s, ws, p), ws, p.id) : ops.saveProfile(s, ws, p)), "Profile saved")) onDone();
      }}
    >
      <Field label="Name">
        <input className={inputCls} value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} placeholder="Night cook" />
      </Field>
      <Field label="Shift (optional)">
        <input className={inputCls} value={p.shift} onChange={(e) => setP({ ...p, shift: e.target.value })} placeholder="11 AM – 7 PM" />
      </Field>

      {ws === "stann" && (
        <>
          <fieldset>
            <legend className="mb-1 text-sm font-bold">Meals I work</legend>
            <p className="mb-2 text-xs text-muted">Other meals are hidden but still one tap away under “Other meals”.</p>
            <div className="grid grid-cols-3 gap-2">
              {MEAL_SERVICES.map((m) => (
                <label key={m} className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 font-bold ${p.meals.includes(m) ? "border-primary bg-accent-soft/50" : "border-line text-muted"}`}>
                  <input type="checkbox" className="h-5 w-5" checked={p.meals.includes(m)} onChange={() => toggleMeal(m)} />
                  {MEAL_LABELS[m]}
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="Counts screen opens on">
            <select className={inputCls} value={p.defaultMeal} onChange={(e) => setP({ ...p, defaultMeal: e.target.value as MealService | "auto" })}>
              <option value="auto">Whichever of my meals is next</option>
              {MEAL_SERVICES.filter((m) => p.meals.includes(m)).map((m) => (
                <option key={m} value={m}>
                  {MEAL_LABELS[m]}
                </option>
              ))}
            </select>
          </Field>
        </>
      )}

      <fieldset>
        <legend className="mb-1 text-sm font-bold">Tabs at the bottom</legend>
        <div className="grid grid-cols-2 gap-2">
          {nav.map((n, i) => (
            <label key={n.href} className="flex min-h-11 items-center gap-2 rounded-xl border border-line px-3">
              <input type="checkbox" className="h-5 w-5" checked={!p.hiddenTabs.includes(n.href)} disabled={i === 0} onChange={() => toggleTab(n.href)} />
              <span className="font-semibold">{n.label}</span>
              {i === 0 && <Badge>always</Badge>}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex gap-2">
        <Button type="submit" size="lg" className="flex-1">
          {isNew ? "Create & use" : "Save"}
        </Button>
        {!isNew && (
          <Button variant="danger" size="lg" onClick={() => window.confirm(`Delete the “${profile.name}” profile?`) && act((s) => ops.deleteProfile(s, ws, profile.id)) && onDone()}>
            Delete
          </Button>
        )}
      </div>
      <Button variant="ghost" onClick={onDone}>
        Back
      </Button>
    </form>
  );
}
