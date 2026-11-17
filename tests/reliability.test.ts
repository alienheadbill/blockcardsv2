import { describe, expect, it } from "vitest";
import * as C from "@/lib/counting";
import { addDays, formatMedium } from "@/lib/dates";
import { FALL_WINTER } from "@/lib/menu/fallWinter";
import { exportFull, restore } from "@/lib/state/backup";
import { initialState } from "@/lib/state/model";
import * as ops from "@/lib/state/ops";

const menu = FALL_WINTER.weeks[1]!.days[1]!.dinner;

describe("duplicate-tap guard", () => {
  it("blocks a second tap on the same box inside the window only", () => {
    expect(C.isDuplicateTap(null, "a", 1000, 300)).toBe(false);
    expect(C.isDuplicateTap({ key: "a", at: 1000 }, "a", 1150, 300)).toBe(true);
    expect(C.isDuplicateTap({ key: "a", at: 1000 }, "a", 1300, 300)).toBe(false);
    expect(C.isDuplicateTap({ key: "a", at: 1000 }, "b", 1050, 300)).toBe(false); // different box: never blocked
    expect(C.isDuplicateTap({ key: "a", at: 1000 }, "a", 1050, 0)).toBe(false); // guard off
  });

  it("rapid taps through the reducer stay exact: n taps = n slips, n undos = 0", () => {
    let s = C.createSession({ date: "2026-11-16", meal: "dinner", menuItems: menu });
    for (let i = 0; i < 500; i++) s = C.tapSlip(s, s.options[i % 2]!.key);
    expect(C.summarize(s).totalMeals).toBe(500);
    expect(new Set(s.events.map((e) => e.id)).size).toBe(500); // every event uniquely identified
    expect(s.events.map((e) => e.seq)).toEqual(Array.from({ length: 500 }, (_, i) => i + 1));
    for (let i = 0; i < 500; i++) s = C.undo(s);
    expect(C.summarize(s).totalMeals).toBe(0);
    expect(C.undo(s)).toBe(s);
  });
});

describe("archiving old counts", () => {
  function finished(date: string) {
    let s = ops.startSession(initialState(), date, "dinner", ["Veggfritata", "Chicken pot"]);
    s = ops.updateSession(s, date, "dinner", (x) => {
      for (let i = 0; i < 10; i++) x = C.tapSlip(x, x.options[i % 3 === 0 ? 0 : 1]!.key);
      x = C.correct(x, { kind: "slip", choice: x.options[0]!.key }, 2, "Two slips under the tray");
      return C.complete(x, ["corrections"]);
    });
    return s;
  }

  it("keeps totals, corrections and reasons but drops individual taps", () => {
    const s = finished("2026-06-01");
    const before = ops.getSession(s, "2026-06-01", "dinner")!;
    const a = C.archiveSession(before);
    expect(a.events).toEqual([]);
    expect(C.summarize(a)).toEqual(C.summarize(before));
    expect(a.archived!.corrections).toEqual([expect.objectContaining({ delta: 2, reason: "Two slips under the tray", label: "Veggfritata" })]);
    expect(a.archived!.tapCount).toBe(before.events.length);
    expect(() => C.tapSlip(a, a.options[0]!.key)).toThrow(/archived/);
    expect(() => C.reopen(a, "x")).toThrow(/archived/);
    expect(JSON.stringify(a).length).toBeLessThan(JSON.stringify(before).length);
  });

  it("only archives completed counts older than the cutoff", () => {
    let s = finished("2026-06-01");
    s = ops.startSession(s, "2026-06-02", "dinner", ["A"]); // still counting
    const today = addDays("2026-06-01", 200);
    const next = ops.archiveOldCounts(s, today, 120);
    expect(ops.getSession(next, "2026-06-01", "dinner")!.archived).toBeTruthy();
    expect(ops.getSession(next, "2026-06-02", "dinner")!.archived).toBeUndefined();
    expect(ops.archiveOldCounts(next, today, 120)).toBe(next); // idempotent
    expect(ops.archiveOldCounts(s, "2026-06-15", 120)).toBe(s); // too recent
    expect(ops.archiveOldCounts(s, today, 0)).toBe(s); // "forever"
  });

  it("archived counts survive backup and restore", () => {
    const s = ops.archiveOldCounts(finished("2026-06-01"), "2027-01-01", 120);
    const res = restore(initialState(), JSON.stringify(exportFull(s)));
    expect(res.ok).toBe(true);
    if (res.ok) expect(C.summarize(ops.getSession(res.state, "2026-06-01", "dinner")!).totalMeals).toBe(12);
  });

  it("a year of dinner counts stays well under phone storage with the default 120-day policy", () => {
    let s = initialState();
    for (let d = 0; d < 365; d++) {
      const date = addDays("2026-01-04", d);
      s = ops.startSession(s, date, "dinner", ["A", "B"]);
      s = ops.updateSession(s, date, "dinner", (x) => {
        for (let i = 0; i < 48; i++) x = C.tapSlip(x, x.options[i % 2]!.key);
        return C.complete(x, []);
      });
    }
    const full = JSON.stringify(s).length;
    const slim = JSON.stringify(ops.archiveOldCounts(s, addDays("2026-01-04", 365), 120)).length;
    expect(slim).toBeLessThan(full / 2);
    expect(slim * 2).toBeLessThan(2.5 * 1024 * 1024); // < half of a ~5 MB quota (UTF-16)
  });
});

describe("backups", () => {
  it("rejects truncated and tampered files without touching current data", () => {
    const raw = JSON.stringify(exportFull(initialState()));
    expect(restore(initialState(), raw.slice(0, raw.length / 2)).ok).toBe(false);
    const tampered = JSON.parse(raw);
    tampered.data.workspaces.stann.requests = [{ id: "x", quantity: -4 }];
    const res = restore(initialState(), JSON.stringify(tampered));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/validation/);
    const future = JSON.parse(raw);
    future.schemaVersion = 99;
    expect(restore(initialState(), JSON.stringify(future)).ok).toBe(false);
  });
});

describe("dates", () => {
  it("drops the year in headers for the current year", () => {
    expect(formatMedium("2026-11-16", new Date(2026, 10, 17))).toBe("Mon, Nov 16");
    expect(formatMedium("2027-01-04", new Date(2026, 10, 17))).toBe("Mon, Jan 4, 2027");
  });
});
