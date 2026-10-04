import AsyncStorage from "@react-native-async-storage/async-storage";
import { randomUUID } from "expo-crypto";
import { accessToken } from "./auth";
import type { Citation, Lang, ProfileSnapshot, Roadmap, VoiceResult } from "./types";

// Point at the Lifeline API (the Next.js app). On a phone, use your computer's LAN IP.
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

let session: string | null = null;
async function sessionId(): Promise<string> {
  if (session) return session;
  session = (await AsyncStorage.getItem("lifeline.session")) ?? randomUUID();
  await AsyncStorage.setItem("lifeline.session", session);
  return session;
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await accessToken();
  return { "x-lifeline-session": await sessionId(), ...(token ? { authorization: `Bearer ${token}` } : {}) };
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { ...init, headers: { ...(init.headers ?? {}), ...(await authHeaders()) } });
  if (!res.ok) throw new Error(`api_${res.status}`);
  return (await res.json()) as T;
}

export const getProfile = () => api<ProfileSnapshot>("/api/profile");
export const getRoadmap = () => api<Roadmap>("/api/roadmap");
export const profileAction = (body: object) =>
  api<ProfileSnapshot>("/api/profile", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export async function filler(language: Lang) {
  return api<{ text: string; audio: { base64: string; mime: string } }>("/api/tts", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: "voice.checking", language }),
  });
}

export async function sendVoice(uri: string, opts: { inputLanguage?: Lang; replyLanguage?: Lang; replyMode: "audio" | "text" }) {
  const form = new FormData();
  // React Native's FormData accepts a file descriptor object for local URIs.
  form.append("audio", { uri, name: "audio.m4a", type: "audio/m4a" } as unknown as Blob);
  if (opts.inputLanguage) form.append("inputLanguage", opts.inputLanguage);
  if (opts.replyLanguage) form.append("replyLanguage", opts.replyLanguage);
  form.append("replyMode", opts.replyMode);
  return api<VoiceResult>("/api/voice", { method: "POST", body: form });
}

/** Typed chat. The server streams NDJSON progress; we read it whole and keep the final event. */
export async function sendText(message: string, replyLanguage?: Lang) {
  const res = await fetch(`${API_URL}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ message, replyLanguage }),
  });
  const lines = (await res.text()).split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const final = lines.find((e) => e.type === "final");
  if (!final) throw new Error("no_final");
  return final as { text: string; citations: Citation[]; pendingKeys: string[]; refused: boolean };
}
