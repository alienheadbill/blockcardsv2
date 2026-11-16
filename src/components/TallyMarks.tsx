import { tallyGroups } from "@/lib/counting";

/** Notebook-style tally: four strokes and a slash per group of five. */
export function TallyMarks({ count, max = 60 }: { count: number; max?: number }) {
  const groups = tallyGroups(Math.min(count, max));
  return (
    <div className="flex flex-wrap gap-x-2 gap-y-1" aria-hidden>
      {groups.map((n, gi) => (
        <svg key={gi} viewBox="0 0 36 28" className="h-6 w-8 text-ink">
          {Array.from({ length: Math.min(n, 4) }, (_, i) => (
            <line key={i} x1={5 + i * 7} y1={3} x2={5 + i * 7} y2={25} stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" />
          ))}
          {n === 5 && <line x1={1} y1={22} x2={33} y2={6} stroke="var(--accent)" strokeWidth={2.6} strokeLinecap="round" />}
        </svg>
      ))}
      {count > max && <span className="text-sm font-bold text-muted">+{count - max}</span>}
    </div>
  );
}
