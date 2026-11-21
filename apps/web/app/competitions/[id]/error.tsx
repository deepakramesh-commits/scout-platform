"use client";

import { RouteError } from "../../route-error";

export default function ErrorPage({ retry }: { retry: () => void }) {
  return <RouteError what="this competition" retry={retry} />;
}
