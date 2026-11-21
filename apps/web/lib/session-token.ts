// A signed session token: `<user id>.<expiry, epoch seconds>.<HMAC-SHA256>`, base64url. Pure, so it is unit tested.
import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_DAYS = 14;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const mac = (payload: string, secret: string) => createHmac("sha256", secret).update(payload).digest("base64url");

export function signSession(userId: string, secret: string, now = Date.now()): string {
  const payload = `${userId}.${Math.floor(now / 1000) + SESSION_DAYS * 86400}`;
  return `${payload}.${mac(payload, secret)}`;
}

/** The user id, or null when the token is malformed, forged or expired. */
export function verifySession(token: string | undefined, secret: string, now = Date.now()): string | null {
  const [userId, exp, sig] = token?.split(".") ?? [];
  if (!userId || !exp || !sig || !UUID.test(userId) || !/^\d+$/.test(exp)) return null;
  const want = Buffer.from(mac(`${userId}.${exp}`, secret));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  return Number(exp) * 1000 > now ? userId : null;
}
