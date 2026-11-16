export const WORKSPACE_IDS = ["stann", "truck", "home"] as const;
export type WorkspaceId = (typeof WORKSPACE_IDS)[number];

export interface NavItem {
  href: string;
  label: string;
  icon: string;
}

export interface WorkspaceConfig {
  id: WorkspaceId;
  name: string;
  tagline: string;
  base: string;
  nav: NavItem[];
}

export const WORKSPACES: Record<WorkspaceId, WorkspaceConfig> = {
  stann: {
    id: "stann",
    name: "St. Ann Rehabilitation",
    tagline: "Institutional kitchen · meal counts & prep",
    base: "/stann",
    nav: [
      { href: "/stann", label: "Today", icon: "today" },
      { href: "/stann/counts", label: "Counts", icon: "tally" },
      { href: "/stann/prep", label: "Prep", icon: "check" },
      { href: "/stann/menu", label: "Menu", icon: "menu" },
      { href: "/stann/recipes", label: "Recipes", icon: "book" },
      { href: "/stann/reports", label: "Reports", icon: "chart" },
    ],
  },
  truck: {
    id: "truck",
    name: "Stop N Chop",
    tagline: "Food truck · tickets, prep & inventory",
    base: "/truck",
    nav: [
      { href: "/truck", label: "Orders", icon: "ticket" },
      { href: "/truck/prep", label: "Prep", icon: "check" },
      { href: "/truck/menu", label: "Menu", icon: "menu" },
      { href: "/truck/inventory", label: "Stock", icon: "box" },
      { href: "/truck/recipes", label: "Recipes", icon: "book" },
      { href: "/truck/reports", label: "Reports", icon: "chart" },
    ],
  },
  home: {
    id: "home",
    name: "Home Kitchen",
    tagline: "Personal recipes, meal plan & groceries",
    base: "/home",
    nav: [
      { href: "/home", label: "Recipes", icon: "book" },
      { href: "/home/plan", label: "Meal Plan", icon: "today" },
      { href: "/home/shopping", label: "Shopping", icon: "cart" },
      { href: "/home/pantry", label: "Pantry", icon: "box" },
    ],
  },
};

export function workspaceFromPath(pathname: string): WorkspaceId | null {
  const seg = pathname.split("/")[1];
  return (WORKSPACE_IDS as readonly string[]).includes(seg ?? "") ? (seg as WorkspaceId) : null;
}
