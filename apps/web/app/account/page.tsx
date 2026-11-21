import { Card } from "@astryxdesign/core/Card";
import { Heading, Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { me } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Account({ searchParams }: { searchParams: Promise<{ inactive?: string }> }) {
  const [user, { inactive }] = await Promise.all([me(), searchParams]);
  if (!user) redirect("/login");
  return (
    <VStack gap={4}>
      <Heading level={1}>{user.display_name ?? user.email}</Heading>
      <Card>
        <VStack gap={1}>
          <Text weight="semibold">{user.org_name ?? "Personal account"}</Text>
          <Text color="secondary">{inactive || !user.active ? "Your account is waiting for one of our admins to switch it on." : `Signed in as ${user.role}.`}</Text>
        </VStack>
      </Card>
    </VStack>
  );
}
