/**
 * Practice slip stacks for demo mode. Every slip is fictional: rooms are
 * "Demo ###" and no names, diets or allergies are generated.
 */
import type { CountSession } from "../counting";

export interface DemoSlip {
  n: number;
  room: string;
  choiceKey: string;
  choiceLabel: string;
  extras: { key: string; label: string }[];
}

/** Small deterministic PRNG so the same service always gets the same stack. */
function rng(seed: string) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function demoStack(session: CountSession, size = 41): DemoSlip[] {
  const rand = rng(`${session.date}|${session.meal}`);
  const entrees = session.options.filter((o) => o.role === "main" || o.role === "alt");
  if (!entrees.length) return [];
  return Array.from({ length: size }, (_, i) => {
    // roughly 60/40 main vs alternate, like the notebook tallies
    const pick = entrees.length === 1 || rand() < 0.6 ? entrees[0]! : entrees[1 + Math.floor(rand() * (entrees.length - 1))]!;
    const extras = session.extras.filter(() => rand() < 0.7).map((x) => ({ key: x.key, label: x.label }));
    return { n: i + 1, room: `Demo ${100 + Math.floor(rand() * 120)}${rand() < 0.5 ? "L" : "R"}`, choiceKey: pick.key, choiceLabel: pick.label, extras };
  });
}
