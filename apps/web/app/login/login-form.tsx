"use client";

import { useActionState, useState, type CSSProperties } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Center } from "@astryxdesign/core/Center";
import { VStack } from "@astryxdesign/core/Layout";
import { Link } from "@astryxdesign/core/Link";
import { Heading, Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { login, type LoginState } from "./actions";

const contentStyle: CSSProperties = { width: "100%", maxWidth: 400 };

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  return (
    <Center axis="both" padding={6}>
      <VStack gap={4} hAlign="center" style={contentStyle}>
        <Card padding={8} width="100%">
          <form action={action}>
            <input type="hidden" name="next" value={next} />
            <VStack gap={4} hAlign="stretch">
              <VStack gap={1} hAlign="center">
                <Heading level={2}>Sign in to Scout</Heading>
                <Text color="secondary" size="sm">Verified data on African football talent</Text>
              </VStack>
              <VStack gap={2}>
                <TextInput label="Email" htmlName="email" type="email" autoComplete="email" placeholder="name@club.com"
                  value={email} onChange={setEmail} size="lg" isRequired />
                <TextInput label="Password" htmlName="password" type="password" autoComplete="current-password" size="lg" isRequired
                  value={password} onChange={setPassword}
                  status={state?.error ? { type: "error", message: state.error } : undefined} />
              </VStack>
              <Button type="submit" label="Sign in" variant="primary" size="lg" isLoading={pending} />
              <VStack hAlign="center">
                <Text type="supporting" color="secondary">
                  No account yet? <Link href="/signup" type="supporting">Sign up</Link>
                </Text>
              </VStack>
            </VStack>
          </form>
        </Card>
        <Text type="supporting" color="secondary" justify="center">
          Demo accounts: <Text type="supporting" weight="semibold">scout@demo.scout</Text> and the other types in the README, password <Text type="supporting" weight="semibold">scout-demo</Text>.
        </Text>
      </VStack>
    </Center>
  );
}
