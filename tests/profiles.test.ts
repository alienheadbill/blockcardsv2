import { describe, expect, it } from "vitest";
import { pickMeal, PROFILE_PRESETS, profileFromPreset, validateProfile } from "@/lib/profiles";
import { appStateSchema } from "@/lib/state/backup";
import { initialState, migrate } from "@/lib/state/model";
import * as ops from "@/lib/state/ops";

const at = (h: number) => new Date(2026, 10, 17, h, 0);

describe("profiles", () => {
  it("St. Ann starts with Night cook (dinner only) active, plus Day cook and Everything", () => {
    const s = initialState();
    const p = ops.activeProfile(s, "stann");
    expect(p).toMatchObject({ name: "Night cook", shift: "11 AM – 7 PM", meals: ["dinner"], defaultMeal: "dinner" });
    expect(s.workspaces.stann.profiles.map((x) => x.name)).toEqual(["Night cook", "Day cook", "Everything"]);
    expect(ops.activeProfile(s, "truck").name).toBe("Owner");
    expect(ops.activeProfile(s, "home").name).toBe("Me");
  });

  it("day cook opens on breakfast in the morning and lunch later", () => {
    const day = profileFromPreset(PROFILE_PRESETS.stann.find((p) => p.presetId === "day")!);
    expect(pickMeal(day, at(6))).toBe("breakfast");
    expect(pickMeal(day, at(11))).toBe("lunch");
    expect(pickMeal(day, at(18))).toBe("lunch"); // never jumps to dinner
    const night = profileFromPreset(PROFILE_PRESETS.stann[0]!);
    expect(pickMeal(night, at(7))).toBe("dinner");
  });

  it("validates and switches profiles; profiles stay inside their workspace", () => {
    let s = initialState();
    const day = s.workspaces.stann.profiles[1]!;
    s = ops.setActiveProfile(s, "stann", day.id);
    expect(ops.activeProfile(s, "stann").name).toBe("Day cook");
    expect(() => ops.setActiveProfile(s, "truck", day.id)).toThrow();
    expect(() => validateProfile({ ...day, meals: [] })).toThrow(/meal/);
    expect(validateProfile({ ...day, meals: ["lunch"], defaultMeal: "breakfast" }).defaultMeal).toBe("lunch");
    s = ops.saveProfile(s, "stann", { ...day, name: "Bill", meals: ["dinner", "lunch"] });
    expect(ops.activeProfile(s, "stann")).toMatchObject({ name: "Bill", meals: ["lunch", "dinner"] });
    s = ops.deleteProfile(s, "stann", day.id);
    expect(ops.activeProfile(s, "stann").name).toBe("Night cook");
    expect(() => ops.deleteProfile(s, "home", s.workspaces.home.profiles[0]!.id)).toThrow(/at least one/);
  });

  it("migrates v4 data: adds profiles with Night cook active", () => {
    const v4 = JSON.parse(JSON.stringify(initialState()));
    v4.schemaVersion = 4;
    for (const ws of ["stann", "truck", "home"]) {
      delete v4.workspaces[ws].profiles;
      delete v4.workspaces[ws].activeProfileId;
    }
    const parsed = appStateSchema.safeParse(migrate(v4));
    expect(parsed.success).toBe(true);
    const s = parsed.data as unknown as ReturnType<typeof initialState>;
    expect(ops.activeProfile(s, "stann").name).toBe("Night cook");
    expect(ops.activeProfile(s, "truck").name).toBe("Owner");
  });
});

describe("shopping list", () => {
  it("deletes single items, checked items, or everything", () => {
    let s = ops.addShopping(initialState(), "home", "Milk");
    s = ops.addShopping(s, "home", "Eggs");
    s = ops.addShopping(s, "home", "Bread");
    const [milk, eggs] = s.workspaces.home.shopping;
    s = ops.deleteShopping(s, "home", milk!.id);
    expect(s.workspaces.home.shopping.map((x) => x.name)).toEqual(["Eggs", "Bread"]);
    s = ops.toggleShopping(s, "home", eggs!.id);
    s = ops.clearDoneShopping(s, "home");
    expect(s.workspaces.home.shopping.map((x) => x.name)).toEqual(["Bread"]);
    s = ops.clearAllShopping(s, "home");
    expect(s.workspaces.home.shopping).toEqual([]);
  });
});
