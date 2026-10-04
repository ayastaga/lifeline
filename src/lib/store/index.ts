import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { bearerToken, supabaseConfigured, userClient } from "../supabase/server";
import { MemoryStore } from "./memory";
import { SupabaseStore } from "./supabase";
import type { Store } from "./types";

export type { Store } from "./types";

/**
 * Resolve the store for this request. With Supabase configured, every visitor
 * gets an anonymous auth user (enable anonymous sign-ins in supabase/config.toml)
 * and RLS isolates their rows. Without it, an in-memory session is used.
 */
export async function getStore(): Promise<Store> {
  if (supabaseConfigured()) {
    const db = await userClient();
    const jwt = await bearerToken();
    let { data } = await db.auth.getUser(jwt);
    // A native client owns its session: a bad token is an error, not a reason to mint a new user.
    if (!data.user && jwt) throw new Error("invalid_access_token");
    if (!data.user) {
      const res = await db.auth.signInAnonymously();
      if (res.error || !res.data.user) throw new Error(`anonymous sign-in failed: ${res.error?.message ?? "no user"}`);
      data = { user: res.data.user };
    }
    return new SupabaseStore(db, data.user!.id);
  }
  const jar = await cookies();
  let sid = jar.get("ll_sid")?.value;
  if (!sid) {
    sid = randomUUID();
    try {
      jar.set("ll_sid", sid, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7 });
    } catch {
      // Read-only cookie context (server component); the next API call will set it.
    }
  }
  return new MemoryStore(sid);
}
