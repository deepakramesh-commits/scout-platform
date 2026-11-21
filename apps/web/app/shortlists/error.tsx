"use client";

import { RouteError } from "../route-error";

export default function ErrorPage({ retry }: { retry: () => void }) {
  return <RouteError what="your shortlists" retry={retry} />;
}
