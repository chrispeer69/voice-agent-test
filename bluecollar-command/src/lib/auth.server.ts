// Server-only authentication for the internal command center.
// All session + cookie logic lives here; client code goes through the thin
// wrappers in auth.functions.ts. No secrets are ever exposed to the browser.

import { getCookie, setResponseHeader, getRequestUrl } from "@tanstack/react-start/server";

const SESSION_COOKIE = "bcc_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

interface SessionPayload {
  userId: string;
  issuedAt: number;
}

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not configured");
  return secret;
}

function accessPassword(): string {
  const pw = process.env.APP_ACCESS_PASSWORD;
  if (!pw) throw new Error("APP_ACCESS_PASSWORD is not configured");
  return pw;
}

/** Constant-time string comparison to avoid timing attacks on the password. */
async function safeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

/** HMAC-sign a payload using the session secret. Returns "payload.signature" (base64url). */
async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(sessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const sigB64 = b64url(new Uint8Array(sig));
  return `${payload}.${sigB64}`;
}

async function verify(token: string): Promise<string | null> {
  const idx = token.lastIndexOf(".");
  if (idx <= 0) return null;
  const payload = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(sessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const sigBytes = unb64url(sig);
  if (!sigBytes) return null;
  const ok = await crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(payload));
  return ok ? payload : null;
}

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unb64url(s: string): Uint8Array | null {
  try {
    const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
    const norm = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
    const bin = atob(norm);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

/** Verify the access password and issue a signed session cookie. */
export async function loginWithPassword(
  password: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!(await safeEqual(password, accessPassword()))) {
    return { ok: false, error: "Incorrect password" };
  }
  const payload: SessionPayload = { userId: "internal-operator", issuedAt: Date.now() };
  const token = await sign(b64url(new TextEncoder().encode(JSON.stringify(payload))));
  setSessionCookie(token);
  return { ok: true };
}

/** Clear the session cookie (sign out). */
export function logout(): void {
  clearSessionCookie();
}

/**
 * Validate the current request's session. Throws a 401 Response when there is
 * no valid session — used to protect every server function and route.
 */
export async function requireSession(): Promise<SessionPayload> {
  const token = getCookie(SESSION_COOKIE);
  if (!token) throw unauthorized();
  const payloadStr = await verify(token);
  if (!payloadStr) throw unauthorized();
  let payload: SessionPayload;
  try {
    const json = JSON.parse(new TextDecoder().decode(unb64url(payloadStr)));
    payload = json as SessionPayload;
  } catch {
    throw unauthorized();
  }
  if (payload.userId !== "internal-operator" || !Number.isFinite(payload.issuedAt) || payload.issuedAt > Date.now() || Date.now() - payload.issuedAt > SESSION_TTL_MS) throw unauthorized();
  return payload;
}

/** Non-throwing session check for SSR/redirect decisions. */
export async function hasSession(): Promise<boolean> {
  try {
    await requireSession();
    return true;
  } catch {
    return false;
  }
}

function unauthorized(): Response {
  return new Response("Unauthorized", { status: 401 });
}

/** The Railway website and its server functions share an origin. */
function cookieSecurity(): string {
  return getRequestUrl({ xForwardedProto: true }).protocol === "https:" ? "; Secure" : "";
}
function setSessionCookie(token: string): void {
  setResponseHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=${token}; HttpOnly${cookieSecurity()}; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`,
  );
}

function clearSessionCookie(): void {
  setResponseHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; HttpOnly${cookieSecurity()}; SameSite=Lax; Path=/; Max-Age=0`,
  );
}
