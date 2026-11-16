const PATHS: Record<string, string> = {
  today: "M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm4 8h2v2H9z",
  tally: "M6 5v14M10 5v14M14 5v14M18 5v14M3 17 21 7",
  check: "M9 6h11M9 12h11M9 18h11M3.5 6l1.5 1.5L7.5 5M3.5 12l1.5 1.5 2.5-2.5M3.5 18l1.5 1.5 2.5-2.5",
  menu: "M5 4h14v16H5zM8 8h8M8 12h8M8 16h5",
  book: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5Zm0 16a2 2 0 0 1 2-2h13v2H6a2 2 0 0 1-2 0Z",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  ticket: "M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4V7Zm6 0v10",
  box: "M3 7l9-4 9 4v10l-9 4-9-4V7Zm0 0 9 4 9-4M12 11v10",
  cart: "M3 4h2l2.5 11h11L21 7H6.2M9 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm9 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z",
  undo: "M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3",
  plus: "M12 5v14M5 12h14",
  swap: "M7 7h13l-3-3M17 17H4l3 3",
  chevL: "M15 18l-6-6 6-6",
  chevR: "M9 18l6-6-6-6",
  warn: "M12 3 2 21h20L12 3Zm0 6v5m0 3v.5",
  x: "M6 6l12 12M18 6 6 18",
  edit: "M4 20h4L19 9l-4-4L4 16v4Z",
  print: "M7 8V3h10v5M7 17H4v-7h16v7h-3M7 14h10v7H7z",
  download: "M12 3v12m0 0-4-4m4 4 4-4M4 19h16",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  lock: "M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4",
};

export function Icon({ name, className = "h-6 w-6", label }: { name: keyof typeof PATHS | string; className?: string; label?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
    >
      <path d={PATHS[name] ?? PATHS.menu} />
    </svg>
  );
}
