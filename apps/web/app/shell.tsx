"use client";

import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { AppShell } from "@astryxdesign/core/AppShell";
import { Layout, LayoutContent } from "@astryxdesign/core/Layout";
import { LinkProvider } from "@astryxdesign/core/Link";
import { NavIcon } from "@astryxdesign/core/NavIcon";
import { Theme } from "@astryxdesign/core/theme";
import { TopNav, TopNavHeading, TopNavItem } from "@astryxdesign/core/TopNav";
import { defaultThemeSlug, themes } from "../astryx-themes";
import { AnchorFallback } from "./anchor-fallback";

// A pitch seen from above: the brand mark.
const mark = (
  <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden>
    <rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" strokeWidth="1.6" />
    <circle cx="12" cy="12" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
  </svg>
);

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
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
              heading={<TopNavHeading heading="Scout" subheading="AFCON 2023" headingHref="/" logo={<NavIcon icon={mark} />} />}
              startContent={
                <>
                  <TopNavItem label="Search" href="/" isSelected={path === "/" || path.startsWith("/players")} />
                  <TopNavItem label="Compare" href="/compare" isSelected={path.startsWith("/compare")} />
                </>
              }
            />
          }
        >
          <Layout height="auto" contentWidth={1200} content={<LayoutContent padding={4}>{children}</LayoutContent>} />
        </AppShell>
      </LinkProvider>
    </Theme>
  );
}
