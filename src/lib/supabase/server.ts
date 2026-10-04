import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";

export const supabaseConfigured = () =>
  !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Access token sent by native clients (the mobile app keeps its own Supabase session). */
export async function bearerToken(): Promise<string | undefined> {
  const h = (await headers()).get("authorization");
  return h?.startsWith("Bearer ") ? h.slice(7) : undefined;
}

/**
 * Per-request client acting as the signed-in user (anonymous or Google). RLS applies.
 * Web: session in cookies. Mobile: `Authorization: Bearer <access token>`.
 */
export async function userClient(): Promise<SupabaseClient> {
  const jwt = await bearerToken();
  if (jwt) {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  const jar = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (list: { name: string; value: string; options: CookieOptions }[]) => {
        try {
          list.forEach(({ name, value, options }) => jar.set(name, value, options));
        } catch {
          // Called from a server component: cookies are read-only there. Route handlers can set them.
        }
      },
    },
  });
}

/** Service-role client for scripts and shared knowledge tables. Never expose to the browser. */
export function adminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL are required");
  return createClient(url, key, { auth: { persistSession: false } });
}
