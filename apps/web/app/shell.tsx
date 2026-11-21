"use client";

import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { AppShell } from "@astryxdesign/core/AppShell";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { LinkProvider } from "@astryxdesign/core/Link";
import { useMediaQuery } from "@astryxdesign/core/hooks";
import { NavIcon } from "@astryxdesign/core/NavIcon";
import { Theme } from "@astryxdesign/core/theme";
import { TopNav, TopNavHeading, TopNavItem } from "@astryxdesign/core/TopNav";
import { defaultThemeSlug, themes } from "../astryx-themes";
import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { navFor, selected } from "@/lib/nav";
import { AnchorFallback } from "./anchor-fallback";

// A pitch seen from above: the brand mark.
const mark = (
  <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden>
    <rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" strokeWidth="1.6" />
    <circle cx="12" cy="12" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
  </svg>
);

export type ShellUser = { name: string; role: string; org: string | null };

export function Shell({ children, subheading, user }: { children: React.ReactNode; subheading: string; user: ShellUser | null }) {
  const path = usePathname();
  const items = navFor(user?.role);
  const current = selected(items, path);
  const wide = useMediaQuery("(min-width: 48rem)");
  const sharedReport = path.startsWith("/r/");
  return (
    <Theme theme={themes[defaultThemeSlug]} mode="dark">
      <AnchorFallback />
      <LinkProvider component={NextLink}>
        <AppShell
          variant="section"
          height="auto"
          topNav={
            <TopNav
              label="Scout"
              heading={<TopNavHeading heading="Scout" subheading={subheading} headingHref="/" logo={<NavIcon icon={mark} />} />}
              startContent={items.length ? <>{items.map((i) => <TopNavItem key={i.href} label={i.label} href={i.href} isSelected={current === i.href} />)}</> : undefined}
              endContent={user ? (
                <HStack gap={2} vAlign="center">
                  <Button size="sm" variant="ghost" href="/account" label={wide ? `${user.name}${user.org ? ` · ${user.org}` : ""}` : "Account"} />
                  <form action="/logout" method="post"><Button type="submit" size="sm" variant="ghost" label="Sign out" /></form>
                </HStack>
              ) : sharedReport ? undefined : (
                <Button size="sm" variant="primary" label="Sign in" href="/login" />
              )}
            />
          }
        >
          <Layout height="auto" contentWidth={1200} content={<LayoutContent padding={4}>{children}</LayoutContent>} />
        </AppShell>
      </LinkProvider>
    </Theme>
  );
}

export function LightTheme({ children }: { children: React.ReactNode }) {
  return <Theme theme={themes[defaultThemeSlug]} mode="light">{children}</Theme>;
}
