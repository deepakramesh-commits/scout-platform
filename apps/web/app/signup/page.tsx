import { redirect } from "next/navigation";
import { me } from "@/lib/auth";
import { SignupForm } from "./signup-form";

export const dynamic = "force-dynamic";

export default async function Signup() {
  if (await me()) redirect("/");
  return <SignupForm />;
}
