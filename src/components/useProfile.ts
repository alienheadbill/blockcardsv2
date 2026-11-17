"use client";
import { useMemo } from "react";
import { pickMeal, type Profile } from "@/lib/profiles";
import * as ops from "@/lib/state/ops";
import { useAppState } from "@/lib/state/store";
import type { WorkspaceId } from "@/lib/workspaces";

/** The active profile for a workspace (falls back to "everything"). */
export function useProfile(ws: WorkspaceId): Profile {
  const data = useAppState((s) => s.workspaces[ws]);
  return useMemo(() => ops.activeProfile({ workspaces: { [ws]: data } } as never, ws), [data, ws]);
}

export function useOpeningMeal(ws: WorkspaceId) {
  const profile = useProfile(ws);
  return pickMeal(profile);
}
