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
  scout: [SEARCH, ROLES, COMPARE, PROFILES, SHORTLISTS, SHADOW, item("Playlists", "/playlists"), SEARCHES, item("Inbox", "/inbox"), COMPETITIONS],
  agent: [SEARCH, ROLES, COMPARE, SHORTLISTS, item("Clients", "/agent"), INTROS, COMPETITIONS],
  federation: [SEARCH, COMPARE, item("Verify", "/verify"), COMPETITIONS],
  coach: [SEARCH, COMPARE, COMPETITIONS, ACCOUNT],
  admin: [SEARCH, ROLES, COMPARE, item("Approvals", "/admin/approvals"), item("Verify", "/verify"), item("Coverage", "/admin/coverage"), INTROS, COMPETITIONS],
  player: [ACCOUNT],
  guardian: [ACCOUNT],
  tagger: [ACCOUNT],
  coordinator: [ACCOUNT],
};

export const SCOUTING_ROLES = ["scout", "agent", "admin", "federation", "coach"];

export const navFor = (role: string | null | undefined): NavItem[] => (role ? NAV[role] ?? [] : []);

export function selected(items: NavItem[], path: string): string | null {
  const owns = (href: string) =>
    href === "/" ? path === "/" || path.startsWith("/players")
      : path === href || path.startsWith(`${href}/`) || (href === "/competitions" && path.startsWith("/teams/"));
  return items.filter((i) => owns(i.href)).sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;
}

export function safeNext(next: string): string {
  if (!next.startsWith("/")) return "/";
  const url = new URL(next, "http://scout.invalid");
  return url.origin === "http://scout.invalid" ? url.pathname + url.search + url.hash : "/";
}
