"use client";

import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";

export function RouteError({ what, retry }: { what: string; retry: () => void }) {
  return (
    <Card>
      <EmptyState
        title={`Could not load ${what}`}
        description="Something failed while loading this page. Try again; if it keeps failing, check that the database is running."
        actions={<Button variant="primary" label="Try again" onClick={() => retry()} />}
      />
    </Card>
  );
}
