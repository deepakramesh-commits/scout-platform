// What each role's top bar offers, for every user in the brief's table. Pure, so it is unit tested; pages still check access themselves.
export type NavItem = { label: string; href: string };

const item = (label: string, href: string): NavItem => ({ label, href });
const SEARCH = item("Search", "/");
const ROLES = item("Find by role", "/roles");
const COMPARE = item("Compare", "/compare");
const PROFILES = item("Profiles", "/profiles");
const SHORTLISTS = item("Shortlists", "/shortlists");
const SHADOW = item("Shadow team", "/shadow-team");
const SEARCHES = item("Saved searches", "/searches");
const COMPETITIONS = item("Competitions", "/competitions");
const INTROS = item("Introductions", "/intros");
const ACCOUNT = item("Account", "/account");

export const NAV: Record<string, NavItem[]> = {
  // Introductions for a club are one click from the inbox; nine items is already the most a top bar holds.
  scout: [SEARCH, ROLES, COMPARE, PROFILES, SHORTLISTS, SHADOW, SEARCHES, item("Inbox", "/inbox"), COMPETITIONS],
  agent: [SEARCH, ROLES, COMPARE, SHORTLISTS, item("Clients", "/agent"), INTROS, COMPETITIONS],
  federation: [SEARCH, COMPARE, item("Verify", "/verify"), COMPETITIONS],
  coach: [SEARCH, COMPARE, COMPETITIONS, ACCOUNT],
  admin: [SEARCH, ROLES, COMPARE, item("Approvals", "/admin/approvals"), item("Verify", "/verify"), item("Coverage", "/admin/coverage"), INTROS, COMPETITIONS],
  player: [ACCOUNT],
  guardian: [ACCOUNT],
  tagger: [ACCOUNT],
  coordinator: [ACCOUNT],
};

/** Roles that use search, profiles and compare. Everyone else starts on /account. */
export const SCOUTING_ROLES = ["scout", "agent", "admin", "federation", "coach"];

export const navFor = (role: string | null | undefined): NavItem[] => (role ? NAV[role] ?? [] : []);

/** The item a path belongs to: the longest href that prefixes it; "/" also owns player pages, teams own their competition. */
export function selected(items: NavItem[], path: string): string | null {
  const owns = (href: string) =>
    href === "/" ? path === "/" || path.startsWith("/players")
      : path === href || path.startsWith(`${href}/`) || (href === "/competitions" && path.startsWith("/teams/"));
  return items.filter((i) => owns(i.href)).sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;
}
