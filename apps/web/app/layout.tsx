import type { Metadata } from "next";
import "@astryxdesign/core/reset.css";
import "@astryxdesign/core/astryx.css";
import "./motion.css";
import { db, me } from "@/lib/auth";
import { SCOUTING_ROLES } from "@/lib/nav";
import { Shell } from "./shell";

export const metadata: Metadata = { title: "Scout · African football talent" };

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await me().catch(() => null);
  const [{ names }] = user
    ? await db((tx) => tx<{ names: string | null }[]>`
        select string_agg(name || ' ' || season, ' · ' order by season desc, name) as names from competitions c
        where exists (select 1 from matches m where m.competition_id = c.id)`).catch(() => [{ names: null }])
    : [{ names: null }];
  return (
    <html lang="en">
      <head>
        {/* The scout theme names DM Sans; Astryx never loads fonts. A <link>, because bundlers drop external @import from CSS. */}
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400..800&display=swap" />
      </head>
      <body>
        <Shell subheading={user && SCOUTING_ROLES.includes(user.role) ? names ?? "No competitions in your plan yet" : ""} user={user && { name: user.display_name ?? user.email ?? "", role: user.role, org: user.org_name }}>{children}</Shell>
      </body>
    </html>
  );
}
