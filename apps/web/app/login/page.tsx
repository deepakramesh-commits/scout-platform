import { redirect } from "next/navigation";
import { me } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const [{ next }, user] = await Promise.all([searchParams, me()]);
  if (user) redirect("/");
  return <LoginForm next={next ?? "/"} />;
}
