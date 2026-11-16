let fallbackCounter = 0;

/** Collision-resistant id. Uses crypto.randomUUID when available. */
export function newId(prefix = ""): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  const raw =
    c && typeof c.randomUUID === "function"
      ? c.randomUUID()
      : `${Date.now().toString(36)}-${(fallbackCounter++).toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return prefix ? `${prefix}_${raw}` : raw;
}

export function nowISO(): string {
  return new Date().toISOString();
}
