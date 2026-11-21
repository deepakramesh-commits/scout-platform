import type { Metadata } from "next";
import "@astryxdesign/core/reset.css";
import "@astryxdesign/core/astryx.css";
import "./motion.css";
import { sql } from "@/lib/db";
import { Shell } from "./shell";

export const metadata: Metadata = { title: "Scout · African football talent" };

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [{ names }] = await sql<{ names: string | null }[]>`
    select string_agg(name || ' ' || season, ' · ' order by season desc, name) as names from competitions`
    .catch(() => [{ names: null }]);
  return (
    <html lang="en">
      <head>
        {/* The scout theme names DM Sans; Astryx never loads fonts. A <link>, because bundlers drop external @import from CSS. */}
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400..800&display=swap" />
      </head>
      <body>
        <Shell subheading={names ?? "No competitions loaded"}>{children}</Shell>
      </body>
    </html>
  );
}
