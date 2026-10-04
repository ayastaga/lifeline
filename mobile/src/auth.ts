import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import { AppState } from "react-native";

// The app keeps its own Supabase session (anonymous first, Google later) and
// sends the access token to the API. Without EXPO_PUBLIC_SUPABASE_* the API
// falls back to its in-memory demo session.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
export const supabase = url && key
  ? createClient(url, key, { auth: { storage: AsyncStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: "pkce" } })
  : null;

if (supabase) {
  // Refresh tokens only while the app is in the foreground.
  AppState.addEventListener("change", (s) => (s === "active" ? supabase.auth.startAutoRefresh() : supabase.auth.stopAutoRefresh()));
}

let anon: Promise<string> | null = null;

/** Access token for API calls. Creates the anonymous user on first use; null in demo mode. */
export async function accessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session.access_token;
  // Parallel first calls share one sign-in instead of creating several users.
  anon ??= supabase.auth.signInAnonymously().then(({ data: d, error }) => {
    if (error || !d.session) throw error ?? new Error("anonymous sign-in failed");
    return d.session.access_token;
  }).finally(() => { anon = null; });
  return anon;
}

function params(u: string): URLSearchParams {
  const [, query = ""] = u.split("?");
  const [q, hash = ""] = query.split("#");
  const p = new URLSearchParams(q);
  new URLSearchParams(hash || u.split("#")[1] || "").forEach((v, k) => p.set(k, v));
  return p;
}

/**
 * Google sign-in in an in-app browser. An anonymous user links Google to the
 * same user, so profile and chats carry over. If that Google account already
 * belongs to another user, sign in to that user instead. Returns false if cancelled.
 */
export async function signInWithGoogle(): Promise<boolean> {
  if (!supabase) throw new Error("supabase_not_configured");
  await accessToken();
  const redirectTo = Linking.createURL("auth");
  const { data: u } = await supabase.auth.getUser();
  const attempt = async (link: boolean): Promise<boolean> => {
    const options = { redirectTo, skipBrowserRedirect: true };
    const start = link ? await supabase.auth.linkIdentity({ provider: "google", options }) : await supabase.auth.signInWithOAuth({ provider: "google", options });
    if (start.error || !start.data.url) throw start.error ?? new Error("oauth_start_failed");
    const result = await WebBrowser.openAuthSessionAsync(start.data.url, redirectTo);
    if (result.type !== "success") return false;
    const p = params(result.url);
    const code = p.get("code");
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) throw error;
      return true;
    }
    if (link && p.get("error_code") === "identity_already_exists") return attempt(false);
    throw new Error(p.get("error_description") ?? "oauth_failed");
  };
  return attempt(!!u.user?.is_anonymous);
}

export async function signOut() {
  await supabase?.auth.signOut();
}

/** Google email of the signed-in user; null when anonymous or in demo mode. */
export function useAccountEmail(): string | null {
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setEmail(s?.user && !s.user.is_anonymous ? (s.user.email ?? "") : null));
    return () => data.subscription.unsubscribe();
  }, []);
  return email;
}
