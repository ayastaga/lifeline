import { z } from "zod";
import { getProvider } from "@/lib/ai/provider";
import { Language } from "@/lib/profile/schema";
import { voiceTurn } from "@/lib/speech/turn";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BYTES = 10_000_000;
const Fields = z.object({
  inputLanguage: Language.optional(),
  replyLanguage: Language.optional(),
  replyMode: z.enum(["audio", "text"]).default("audio"),
});

// One voice turn: audio in -> transcript -> verified answer -> audio out.
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof File)) return Response.json({ error: "no_audio" }, { status: 400 });
  if (audio.size > MAX_BYTES) return Response.json({ error: "audio_too_large" }, { status: 413 });
  const opt = (k: string) => { const v = form!.get(k); return typeof v === "string" && v ? v : undefined; };
  const fields = Fields.safeParse({ inputLanguage: opt("inputLanguage"), replyLanguage: opt("replyLanguage"), replyMode: opt("replyMode") });
  if (!fields.success) return Response.json({ error: "invalid_fields", issues: fields.error.issues }, { status: 400 });
  try {
    const result = await voiceTurn({
      audio: Buffer.from(await audio.arrayBuffer()), mime: audio.type || "audio/m4a",
      store: await getStore(), provider: getProvider(), ...fields.data,
    });
    return Response.json(result);
  } catch (e) {
    console.error("voice_error", (e as Error).message); // no user content in logs
    return Response.json({ error: "voice_turn_failed" }, { status: 502 });
  }
}
