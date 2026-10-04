import { supabaseConfigured, userClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Who is signed in. `email` is null for anonymous users. */
export async function GET() {
  if (!supabaseConfigured()) return Response.json({ configured: false, email: null });
  const { data } = await (await userClient()).auth.getUser();
  return Response.json({ configured: true, email: data.user && !data.user.is_anonymous ? (data.user.email ?? null) : null });
}
