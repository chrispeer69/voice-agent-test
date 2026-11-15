// Thin server-function wrappers for authentication. Client-safe to import.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { hasSession, loginWithPassword, logout } from "./auth.server";

/** Non-throwing session check — safe to call from beforeLoad/loaders/prerender. */
export const checkSession = createServerFn({ method: "GET" }).handler(async () => {
  return { authenticated: await hasSession() };
});

export const login = createServerFn({ method: "POST" })
  .validator((data: { password: string }) =>
    z.object({ password: z.string().min(1).max(200) }).parse(data),
  )
  .handler(async ({ data }) => {
    return loginWithPassword(data.password);
  });

export const signOut = createServerFn({ method: "POST" }).handler(async () => {
  logout();
  return { ok: true };
});
