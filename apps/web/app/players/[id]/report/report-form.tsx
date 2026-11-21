"use client";

import Form from "next/form";
import { useActionState, useState } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { HStack } from "@astryxdesign/core/HStack";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { RadioList, RadioListItem } from "@astryxdesign/core/RadioList";
import { Heading, Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { RECOMMENDATION_LABEL, RECOMMENDATIONS, ratingField, TEXT_MAX, type ReportField } from "@/lib/report-form";
import { saveReport } from "./actions";

export type RatingGroup = { title: string; note: string; attributes: { key: string; label: string; source: string }[] };
export type ReportDraft = {
  id: string | null; seenIn: string; recommendation: string; strengths: string; weaknesses: string; comments: string;
  ratings: Record<string, number>;
};

const REC_HELP = { sign: "Ready to act on now.", follow: "Worth watching again.", pass: "Not for this club." } as const;
const error = (message: string | undefined) => (message ? { type: "error" as const, message } : undefined);

export function ReportForm({ playerId, groups, draft }: { playerId: string; groups: RatingGroup[]; draft: ReportDraft }) {
  const [state, action, pending] = useActionState(saveReport, null);
  const [text, setText] = useState({ seenIn: draft.seenIn, strengths: draft.strengths, weaknesses: draft.weaknesses, comments: draft.comments });
  const [recommendation, setRecommendation] = useState(draft.recommendation);
  const [ratings, setRatings] = useState<Record<string, number | null>>(draft.ratings);
  const [errors, setErrors] = useState<Partial<Record<ReportField, string>>>({});
  const [seen, setSeen] = useState(state);
  if (state !== seen) { setSeen(state); setErrors(state?.errors ?? {}); }
  const clear = (...fields: ReportField[]) => setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !fields.includes(k as ReportField))));
  const write = (k: keyof typeof text) => (v: string) => { setText((t) => ({ ...t, [k]: v })); clear(k, "content"); };
  const rated = Object.values(ratings).filter((v) => v != null).length;

  return (
    <Form action={action} noValidate>
      <input type="hidden" name="playerId" value={playerId} />
      {draft.id && <input type="hidden" name="reportId" value={draft.id} />}
      <VStack gap={6}>
        {Object.keys(errors).length > 0 && (
          <Banner status="error" title="The report was not saved" description={Object.values(errors).join(" ")} collapsible={false} />
        )}
        <Card>
          <VStack gap={4}>
            <TextInput label="Where you saw him" htmlName="seenIn" value={text.seenIn} onChange={write("seenIn")} isRequired
              placeholder="e.g. Zambia v Tanzania, 21 Jan, live" description="A match, a training session or an interview, with the date." status={error(errors.seenIn)} />
            <RadioList label="Recommendation" htmlName="recommendation" value={recommendation} isRequired
              onChange={(v) => { setRecommendation(v); clear("recommendation"); }} status={error(errors.recommendation)}>
              {RECOMMENDATIONS.map((r) => <RadioListItem key={r} value={r} label={RECOMMENDATION_LABEL[r]} description={REC_HELP[r]} />)}
            </RadioList>
          </VStack>
        </Card>

        <VStack gap={2}>
          <Heading level={2}>Ratings</Heading>
          <Text color="secondary">
            1 is poor and 10 is outstanding for the level you scout. Leave a rating empty when you did not see enough to judge. {rated} of {groups.reduce((n, g) => n + g.attributes.length, 0)} rated.
          </Text>
        </VStack>
        {groups.map((g) => (
          <Card key={g.title}>
            <VStack gap={4}>
              <VStack gap={1}>
                <Heading level={3}>{g.title}</Heading>
                <Text type="supporting">{g.note}</Text>
              </VStack>
              <Grid columns={{ minWidth: 220, repeat: "fill" }} gap={4}>
                {g.attributes.map((a) => (
                  <NumberInput key={a.key} label={a.label} description={a.source} htmlName={ratingField(a.key)} value={ratings[a.key] ?? null}
                    onChange={(v: number | null) => { setRatings((r) => ({ ...r, [a.key]: v })); clear("ratings", "content"); }}
                    min={1} max={10} isIntegerOnly hasClear isOptional placeholder="Not rated" />
                ))}
              </Grid>
            </VStack>
          </Card>
        ))}

        <Card>
          <VStack gap={4}>
            <Heading level={2}>In your words</Heading>
            <TextArea label="Strengths" htmlName="strengths" value={text.strengths} onChange={write("strengths")} isOptional rows={3}
              maxLength={TEXT_MAX} status={error(errors.strengths)} />
            <TextArea label="Weaknesses" htmlName="weaknesses" value={text.weaknesses} onChange={write("weaknesses")} isOptional rows={3}
              maxLength={TEXT_MAX} status={error(errors.weaknesses)} />
            <TextArea label="Comments" htmlName="comments" value={text.comments} onChange={write("comments")} isOptional rows={5}
              description="Examples from matches, training and interviews: what he did, when, and what it tells you."
              maxLength={TEXT_MAX} status={error(errors.comments)} />
          </VStack>
        </Card>

        <HStack gap={3} wrap="wrap" vAlign="center">
          <Button type="submit" variant="primary" label={draft.id ? "Save changes" : "Save report"} isLoading={pending} />
          <Button variant="ghost" label="Cancel" href={`/players/${playerId}?tab=scout`} />
        </HStack>
      </VStack>
    </Form>
  );
}
