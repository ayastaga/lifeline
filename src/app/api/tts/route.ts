import { z } from "zod";
import { t } from "@/lib/i18n";
import { Language } from "@/lib/profile/schema";
import { ttsFor } from "@/lib/speech/router";

export const runtime = "nodejs";

// Fixed phrases only (e.g. "Let me check that." while tools run). Not an open
// text-to-speech proxy: arbitrary text never reaches the speech provider here.
const ALLOWED = ["voice.checking", "talk.start"] as const;
const Body = z.object({ key: z.enum(ALLOWED), language: Language });
const cache = new Map<string, { base64: string; mime: string }>();

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 });
  const { key, language } = parsed.data;
  const id = `${key}:${language}`;
  if (!cache.has(id)) {
    try {
      const s = await ttsFor(language).synthesize(t(language, key), { language });
      cache.set(id, { base64: s.audio.toString("base64"), mime: s.mime });
    } catch (e) {
      console.error("tts_error", (e as Error).message);
      return Response.json({ error: "tts_failed" }, { status: 502 });
    }
  }
  return Response.json({ text: t(language, key), audio: cache.get(id) });
}
