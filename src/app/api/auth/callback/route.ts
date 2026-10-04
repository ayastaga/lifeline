import { NextResponse } from "next/server";
import { userClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Google -> Supabase -> here with ?code= (PKCE). The code verifier is in a cookie set by /api/auth/google.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (code) {
    const { error } = await (await userClient()).auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${url.origin}/`);
  }
  // Google account already linked to a different user: sign in to that user instead.
  if (url.searchParams.get("error_code") === "identity_already_exists") return NextResponse.redirect(`${url.origin}/api/auth/google?mode=signin`);
  return NextResponse.redirect(`${url.origin}/?auth_error=callback_failed`);
}
