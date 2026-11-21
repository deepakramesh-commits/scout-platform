import { HStack } from "@astryxdesign/core/HStack";
import { ActionForm, Field, Submit } from "./forms";
import { saveSearch } from "./searches/actions";

export function SaveSearch({ query }: { query: string }) {
  return (
    <ActionForm action={saveSearch} done="Saved. Saved searches shows players who match from now on.">
      <input type="hidden" name="query" value={query} />
      <HStack gap={2} vAlign="end" wrap="wrap">
        <Field label="Save this search as" name="name" placeholder="e.g. Fast left wingers under 23" width={280} />
        <Submit label="Save search" variant="secondary" />
      </HStack>
    </ActionForm>
  );
}
