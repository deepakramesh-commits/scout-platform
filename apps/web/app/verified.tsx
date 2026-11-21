import { Icon } from "@astryxdesign/core/Icon";
import { Token } from "@astryxdesign/core/Token";

// Unverified is a state of its own, never just a missing badge: the business rule is that it is clearly marked.
export function VerifiedMark({ verified }: { verified: boolean }) {
  return verified
    ? <Token size="sm" color="green" label="Verified" icon={<Icon icon="success" />} description="Federation registration, ID and photo checked" />
    : <Token size="sm" color="gray" label="Unverified" icon={<Icon icon="warning" />} description="ID and registration not yet checked" />;
}
