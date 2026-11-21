"use client";

import Form from "next/form";
import { useActionState, useState } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Divider } from "@astryxdesign/core/Divider";
import { Grid } from "@astryxdesign/core/Grid";
import { HStack } from "@astryxdesign/core/HStack";
import { MultiSelector, type MultiSelectorOptionType } from "@astryxdesign/core/MultiSelector";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { Selector } from "@astryxdesign/core/Selector";
import { StackItem } from "@astryxdesign/core/Stack";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { PRIORITY_LABEL } from "@/lib/fit";
import { AGE_MAX, AGE_MIN, priorityField, type ProfileField } from "@/lib/profile-form";
import { saveProfile } from "./actions";

type Option = { value: string; label: string };
type AttributeOption = Option & { source: string; group: string };

const PRIORITIES = Object.entries(PRIORITY_LABEL).map(([value, label]) => ({ value, label }));
const error = (message: string | undefined) => (message ? { type: "error" as const, message } : undefined);

export function ProfileForm({ positions, attributes }: { positions: Option[]; attributes: AttributeOption[] }) {
  const [state, action, pending] = useActionState(saveProfile, null);
  const [name, setName] = useState("");
  const [club, setClub] = useState("");
  const [roles, setRoles] = useState<string[]>([]);
  const [ageMin, setAgeMin] = useState<number | null>(null);
  const [ageMax, setAgeMax] = useState<number | null>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const [priority, setPriority] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Partial<Record<ProfileField, string>>>({});
  const [seen, setSeen] = useState(state);
  if (state !== seen) { setSeen(state); setErrors(state?.errors ?? {}); }
  const edit = <T,>(field: ProfileField, set: (v: T) => void) => (v: T) => {
    set(v);
    setErrors(({ [field]: _, ...rest }) => rest);
  };
  const byKey = new Map(attributes.map((a) => [a.value, a]));
  const sections: MultiSelectorOptionType[] = [...new Set(attributes.map((a) => a.group))].map((g) => ({
    type: "section", title: g.charAt(0).toUpperCase() + g.slice(1),
    options: attributes.filter((a) => a.group === g).map(({ value, label }) => ({ value, label })),
  }));

  return (
    <Form action={action} noValidate>
      <VStack gap={5}>
        {Object.keys(errors).length > 0 && (
          <Banner status="error" title="The profile was not saved" description={Object.values(errors).join(" ")} collapsible={false} />
        )}
        <Grid columns={{ minWidth: 260 }} gap={4}>
          <TextInput label="Profile name" htmlName="name" value={name} onChange={edit("name", setName)} isRequired placeholder="e.g. Pressing striker" status={error(errors.name)} />
          <TextInput label="Club" htmlName="club" value={club} onChange={edit("club", setClub)} isOptional placeholder="e.g. Malmö FF" status={error(errors.club)} />
        </Grid>
        <MultiSelector label="Positions" htmlName="positions" options={positions} value={roles} onChange={edit("positions", setRoles)}
          triggerDisplay="labels" isRequired placeholder="Choose positions" presentation="adaptive" status={error(errors.positions)} />
        <HStack gap={4} wrap="wrap">
          <NumberInput label="Age from" htmlName="ageMin" value={ageMin} onChange={edit("ages", setAgeMin)} min={AGE_MIN} max={AGE_MAX} isIntegerOnly hasClear isOptional width={160} status={error(errors.ages)} />
          <NumberInput label="Age to" htmlName="ageMax" value={ageMax} onChange={edit("ages", setAgeMax)} min={AGE_MIN} max={AGE_MAX} isIntegerOnly hasClear isOptional width={160} status={error(errors.ages)} />
        </HStack>
        <Divider />
        <MultiSelector label="Attributes" htmlName="attributes" options={sections} value={chosen} onChange={edit("items", setChosen)}
          hasSearch triggerDisplay="count" formatValue={(items) => `${items.length} chosen`} isRequired placeholder="Choose what the player must have"
          presentation="adaptive" description="Then set how much each one matters." status={error(errors.items)} />
        {chosen.length > 0 && (
          <VStack gap={2}>
            {chosen.map((k) => {
              const a = byKey.get(k);
              return (
                <HStack key={k} gap={3} vAlign="center" wrap="wrap">
                  <StackItem size="fill">
                    <VStack gap={0}>
                      <Text weight="semibold">{a?.label ?? k}</Text>
                      <Text type="supporting">{a?.source}</Text>
                    </VStack>
                  </StackItem>
                  <Selector label={`Priority for ${a?.label ?? k}`} isLabelHidden htmlName={priorityField(k)} options={PRIORITIES}
                    value={priority[k] ?? "high"} onChange={(v) => setPriority((s) => ({ ...s, [k]: v }))} width={160} />
                </HStack>
              );
            })}
          </VStack>
        )}
        <HStack>
          <Button type="submit" variant="primary" label="Save and rank players" isLoading={pending} />
        </HStack>
      </VStack>
    </Form>
  );
}
