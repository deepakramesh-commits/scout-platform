import { Token } from "@astryxdesign/core/Token";
import type { Status } from "@/lib/engine";

const LOOK: Record<Status, { label: string; color: "gray" | "blue" | "yellow" | "green" }> = {
  uploaded: { label: "Uploaded", color: "gray" },
  tagging: { label: "Tagging", color: "blue" },
  review: { label: "In review", color: "yellow" },
  published: { label: "Published", color: "green" },
};

export function StatusToken({ status }: { status: Status }) {
  return <Token size="sm" label={LOOK[status].label} color={LOOK[status].color} />;
}
