import { NextResponse } from "next/server";
import { supabaseConfigured, userClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Web Google sign-in. An anonymous visitor links Google to their current user,
// so profile and chats carry over. ?mode=signin starts a plain sign-in instead
// (used when that Google account already belongs to another user).
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!supabaseConfigured()) return NextResponse.redirect(`${url.origin}/?auth_error=not_configured`);
  const db = await userClient();
  const redirectTo = `${url.origin}/api/auth/callback`;
  const { data } = await db.auth.getUser();
  const link = !!data.user?.is_anonymous && url.searchParams.get("mode") !== "signin";
  const res = link
    ? await db.auth.linkIdentity({ provider: "google", options: { redirectTo } })
    : await db.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
  if (res.error || !res.data.url) return NextResponse.redirect(`${url.origin}/?auth_error=start_failed`);
  return NextResponse.redirect(res.data.url);
}
