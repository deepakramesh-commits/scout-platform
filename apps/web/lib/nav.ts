// What each role's top bar offers. Pure, so it is unit tested; pages still check access themselves.
export type NavItem = { label: string; href: string };

const SCOUTING: NavItem[] = [
  { label: "Search", href: "/" },
  { label: "Find by role", href: "/roles" },
  { label: "Compare", href: "/compare" },
  { label: "Profiles", href: "/profiles" },
];

export const NAV: Record<string, NavItem[]> = {
  scout: SCOUTING,
  agent: SCOUTING,
  admin: SCOUTING,
  federation: SCOUTING,
  coach: SCOUTING,
  player: [],
  guardian: [],
  tagger: [],
  coordinator: [],
};

/** Roles that use search, profiles and compare. Everyone else starts on /account. */
export const SCOUTING_ROLES = ["scout", "agent", "admin", "federation", "coach"];

export const navFor = (role: string | null | undefined): NavItem[] => (role ? NAV[role] ?? [] : []);

/** The item a path belongs to: the longest href that prefixes it; "/" also owns player pages. */
export function selected(items: NavItem[], path: string): string | null {
  const hit = items.filter((i) => (i.href === "/" ? path === "/" || path.startsWith("/players") : path === i.href || path.startsWith(`${i.href}/`)));
  return hit.sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;
}
