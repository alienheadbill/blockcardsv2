import type { ResolvedMeal } from "@/lib/menu/rotation";
import { KIND_LABELS, type MenuItem } from "@/lib/menu/types";
import { Badge } from "./ui";

export function positionLabel(r: Pick<ResolvedMeal, "position">) {
  return r.position ? `Week ${r.position.week} · ${r.position.dayName}` : "Rotation not set";
}

export function KindTag({ item }: { item: MenuItem }) {
  const short = item.printedLabel ? `${item.printedLabel}:` : item.kind === "main" ? "Main" : KIND_LABELS[item.kind];
  const tone = item.kind === "main" ? "accent" : item.kind === "alt" ? "accent" : "neutral";
  return (
    <span className="inline-flex w-14 shrink-0 justify-center">
      <Badge tone={tone}>{short}</Badge>
    </span>
  );
}

export function MenuList({ items, compact = false, onEdit }: { items: MenuItem[]; compact?: boolean; onEdit?: (item: MenuItem) => void }) {
  return (
    <ul className={compact ? "space-y-1" : "space-y-2"}>
      {items.map((item) => (
        <li key={item.id} className="flex items-start gap-2">
          <KindTag item={item} />
          <div className="min-w-0 flex-1">
            <span className={`${item.kind === "main" || item.kind === "alt" ? "font-bold" : ""} ${compact ? "text-sm" : "text-base"}`}>{item.text}</span>
            {item.flag && (
              <span className="mt-0.5 block text-xs font-semibold text-warn" title={item.flag}>
                ⚠ Review: {item.flag}
              </span>
            )}
          </div>
          {onEdit && (
            <button type="button" onClick={() => onEdit(item)} className="shrink-0 rounded-lg px-2 py-1 text-sm font-semibold text-primary underline" aria-label={`Edit ${item.text}`}>
              Edit
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
