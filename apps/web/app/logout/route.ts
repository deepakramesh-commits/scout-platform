import { NextResponse } from "next/server";
import { endSession } from "@/lib/auth";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !URL.canParse(origin) || new URL(origin).host !== host) return new NextResponse("Forbidden", { status: 403 });
  await endSession();
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
