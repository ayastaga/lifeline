import { supabaseConfigured, userClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// The next request starts a fresh anonymous session.
export async function POST() {
  if (supabaseConfigured()) await (await userClient()).auth.signOut();
  return Response.json({ ok: true });
}
