"use client";

import { useState, useTransition, type CSSProperties } from "react";
import type { ISODateString } from "@astryxdesign/core/Calendar";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Center } from "@astryxdesign/core/Center";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { DateInput } from "@astryxdesign/core/DateInput";
import { Divider } from "@astryxdesign/core/Divider";
import { HStack } from "@astryxdesign/core/HStack";
import { Link } from "@astryxdesign/core/Link";
import { List, ListItem } from "@astryxdesign/core/List";
import { RadioList, RadioListItem } from "@astryxdesign/core/RadioList";
import { Selector } from "@astryxdesign/core/Selector";
import { Heading, Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { ROLE_NAMES } from "@/lib/metrics";
import { ACCOUNT_TYPES, ageOn, type AccountType } from "@/lib/signup";
import { findClaimable, signup, type Claimable } from "./actions";

const columnStyle: CSSProperties = { width: "100%", maxWidth: 560 };
const TYPES = Object.entries(ACCOUNT_TYPES) as [AccountType, (typeof ACCOUNT_TYPES)[AccountType]][];
const BLURB: Record<AccountType, string> = {
  scout: "Search, compare and shortlist players for your club",
  agent: "Track your clients and send profiles to clubs",
  federation: "See your competition's data and verify player IDs",
  coach: "Add test results and follow your own players",
  coordinator: "Fill in the match sheet on match day",
  analyst: "Log match events. An admin switches staff accounts on",
  player: "Create or claim your profile and see your own statistics",
  guardian: "Sign up a player under 18 in your care",
};
const POSITIONS = Object.entries(ROLE_NAMES).map(([value, label]) => ({ value, label }));
const status = (m: string | undefined) => (m ? { type: "error" as const, message: m } : undefined);

export function SignupForm() {
  const [type, setType] = useState<AccountType>("scout");
  const [v, setV] = useState({ name: "", email: "", password: "", org: "", playerName: "", nationality: "", guardianName: "", guardianContact: "" });
  const [dob, setDob] = useState<ISODateString | undefined>();
  const [position, setPosition] = useState<string | null>(null);
  const [mode, setMode] = useState<"new" | "claim">("new");
  const [claim, setClaim] = useState<Claimable | null>(null);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Claimable[] | null>(null);
  const [consent, setConsent] = useState(false);
  const [step, setStep] = useState<"details" | "consent">("details");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const [searching, startSearch] = useTransition();

  const spec = ACCOUNT_TYPES[type];
  const forPlayer = type === "player" || type === "guardian";
  const age = dob ? ageOn(dob, new Date()) : null;
  const under = age !== null && age < 18;
  const field = (k: keyof typeof v) => ({
    value: v[k], status: status(errors[k]),
    onChange: (x: string) => { setV((s) => ({ ...s, [k]: x })); setErrors(({ [k]: _, ...rest }) => rest); },
  });
  const child = type === "guardian" ? (claim?.display_name ?? (v.playerName || "the player")) : "you";

  const submit = () => start(async () => {
    const result = await signup({
      type, ...v, playerName: type === "guardian" && claim ? claim.display_name : v.playerName, dateOfBirth: dob ?? "",
      position: position ?? "", consent, claimPlayerId: mode === "claim" ? claim?.id ?? "" : "",
    });
    if (result) {
      setErrors(result);
      // Field errors live on the details step; only a missing consent keeps the user on the consent step.
      if (Object.keys(result).some((k) => k !== "consent")) setStep("details");
    }
  });
  const next = () => {
    if (mode === "claim" && !claim) return setErrors((e) => ({ ...e, claimPlayerId: "Find your profile and choose it, or create a new one." }));
    setStep("consent");
  };
  const search = () => startSearch(async () => setFound(await findClaimable(query)));

  if (step === "consent") {
    return (
      <Center axis="horizontal" padding={4}>
        <VStack gap={4} style={columnStyle}>
          <Card padding={5}>
            <VStack gap={4}>
              <VStack gap={1}>
                <Text type="label" color="accent">Step 2 of 2 · Consent</Text>
                <Heading level={2}>What clubs will see</Heading>
              </VStack>
              <Text>When the profile is live, scouts at clubs and licensed agents who subscribe to Scout can see:</Text>
              <List>
                <ListItem label={<Text>Name, position, nationality and year of birth</Text>} />
                <ListItem label={<Text>Statistics from published matches, and physical test results</Text>} />
                <ListItem label={<Text>Whether the identity has been verified (yes or no)</Text>} />
                <ListItem label={<Text>Contract status and availability, when you add them</Text>} />
              </List>
              <Text>They never see the date of birth, the legal name, ID documents or guardian contact details. Those stay with our admins and, for verification, the federation.</Text>
              {under && (
                <Banner status="info" title="This profile waits for approval"
                  description={`Because ${child === "you" ? "you are" : `${child} is`} under 18, clubs cannot see the profile until one of our admins approves it. ${v.guardianName || "The guardian"} is recorded as the parent or guardian.`} collapsible={false} />
              )}
              <Text><Text weight="semibold">How to withdraw.</Text> Sign in and open Account, then choose Withdraw consent. The profile is hidden from clubs at once and personal data is queued for deletion.</Text>
              <CheckboxInput label={type === "guardian" ? `I am ${child}'s parent or guardian and agree to share this profile with clubs` : "I agree to share my profile with clubs as described above"}
                value={consent} onChange={(c) => { setConsent(c); setErrors(({ consent: _, ...rest }) => rest); }} status={status(errors.consent)} />
              <HStack gap={2} wrap="wrap">
                <Button variant="primary" label="Create account" isLoading={pending} onClick={submit} />
                <Button variant="ghost" label="Back" onClick={() => setStep("details")} />
              </HStack>
            </VStack>
          </Card>
        </VStack>
      </Center>
    );
  }

  return (
    <Center axis="horizontal" padding={4}>
      <VStack gap={4} style={columnStyle}>
        <Card padding={5}>
          <VStack gap={5}>
            <VStack gap={1}>
              {forPlayer && <Text type="label" color="accent">Step 1 of 2 · Details</Text>}
              <Heading level={2}>Create your Scout account</Heading>
              <Text color="secondary">Already have one? <Link href="/login">Sign in</Link></Text>
            </VStack>
            {Object.keys(errors).length > 0 && (
              <Banner status="error" title="Check the highlighted fields" description={Object.values(errors).join(" ")} collapsible={false} />
            )}
            <RadioList label="I am a" value={type} onChange={(t) => { const hit = TYPES.find(([k]) => k === t); if (hit) { setType(hit[0]); setErrors({}); } }}>
              {TYPES.map(([key, t]) => <RadioListItem key={key} value={key} label={t.label} description={BLURB[key]} />)}
            </RadioList>
            <Divider />
            <VStack gap={3}>
              <TextInput label={type === "guardian" ? "Your name" : "Full name"} autoComplete="name" isRequired {...field("name")} />
              <TextInput label="Email" type="email" autoComplete="email" isRequired {...field("email")} />
              <TextInput label="Password" type="password" autoComplete="new-password" isRequired description="At least 10 characters" {...field("password")} />
              {spec.orgKind && <TextInput label={spec.orgLabel ?? "Organisation"} isRequired {...field("org")} />}
              {type === "analyst" && <Text type="supporting">Analyst accounts start switched off. One of our admins switches yours on.</Text>}
            </VStack>

            {forPlayer && (
              <>
                <Divider />
                <RadioList label={type === "guardian" ? "The player's profile" : "Your profile"} value={mode}
                  onChange={(m) => { setMode(m === "claim" ? "claim" : "new"); setErrors({}); }}>
                  <RadioListItem value="new" label="Create a new profile" />
                  <RadioListItem value="claim" label="Claim a profile built from match data" description="If the player has played in a competition we cover, the profile may already exist. An admin checks it before linking it." />
                </RadioList>
                {mode === "claim" ? (
                  <VStack gap={2}>
                    <HStack gap={2} vAlign="end" wrap="wrap">
                      <TextInput label="Find the profile by name" value={query} onChange={setQuery} placeholder="At least 3 letters" width={260} status={status(errors.claimPlayerId)} />
                      <Button label="Find" isLoading={searching} onClick={search} />
                    </HStack>
                    {found && found.length === 0 && <Text type="supporting">No unclaimed profile matches. Check the spelling, or create a new profile.</Text>}
                    {found && found.length > 0 && (
                      <RadioList label="Choose the profile" value={claim?.id ?? ""} onChange={(id) => setClaim(found.find((f) => f.id === id) ?? null)}>
                        {found.map((f) => <RadioListItem key={f.id} value={f.id} label={f.display_name}
                          description={[f.primary_position && ROLE_NAMES[f.primary_position], f.nationality].filter(Boolean).join(" · ") || undefined} />)}
                      </RadioList>
                    )}
                  </VStack>
                ) : type === "guardian" && (
                  <TextInput label="Player's full name" isRequired {...field("playerName")} />
                )}
                <DateInput label={type === "guardian" ? "Player's date of birth" : "Date of birth"} value={dob} isRequired
                  onChange={(d) => { setDob(d); setErrors(({ dateOfBirth: _, ...rest }) => rest); }} status={status(errors.dateOfBirth)}
                  description="Kept private. Clubs see only the year." />
                {mode === "new" && (
                  <HStack gap={3} wrap="wrap">
                    <Selector label="Position" options={POSITIONS} value={position} onChange={setPosition} hasClear isOptional placeholder="Choose" width={220} presentation="adaptive" />
                    <TextInput label="Nationality" isOptional width={200} {...field("nationality")} />
                  </HStack>
                )}
                {under && (
                  <VStack gap={3}>
                    <Banner status="info" title="Under 18: a parent or guardian is needed"
                      description="The profile waits as pending approval until one of our admins approves it. Clubs cannot see it before then." collapsible={false} />
                    {type === "player" && <TextInput label="Parent or guardian's name" isRequired {...field("guardianName")} />}
                    <TextInput label={type === "player" ? "Parent or guardian's phone or email" : "Your phone or email"} isRequired {...field("guardianContact")} />
                  </VStack>
                )}
              </>
            )}

            <HStack>
              {forPlayer
                ? <Button variant="primary" label="Continue to consent" onClick={next} />
                : <Button variant="primary" label="Create account" isLoading={pending} onClick={submit} />}
            </HStack>
          </VStack>
        </Card>
      </VStack>
    </Center>
  );
}
