import type { Lang } from "../i18n/detect";
import { BCP47, KEYTERMS, type SpeechToText, type TextToSpeech } from "./types";

// Sarvam (Indian languages). REST shapes from docs.sarvam.ai (checked 2026-10-04):
//   POST /speech-to-text  multipart: file, model, language_code, keyterms (JSON array, saaras:v4 only) -> { transcript, language_code }
//   POST /text-to-speech  json: text, language_code, model, speaker, output_audio_codec, enable_preprocessing -> { audios: [base64] }
const BASE = process.env.SARVAM_BASE_URL ?? "https://api.sarvam.ai";
const FROM_BCP47: Record<string, Lang> = { "hi-IN": "hi", "pa-IN": "pa", "en-IN": "en", "ur-IN": "ur" };
const TTS_MAX = 2400; // bulbul:v3 limit is 2,500 characters per request

function key() {
  const k = process.env.SARVAM_API_KEY;
  if (!k) throw new Error("SARVAM_API_KEY is not set");
  return k;
}

export class SarvamSpeechToText implements SpeechToText {
  readonly name = "sarvam";
  async transcribe(audio: Buffer, opts: { mime: string; language?: Lang; keyterms?: string[] }) {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(audio)], { type: opts.mime }), "audio");
    const model = process.env.SARVAM_STT_MODEL ?? "saaras:v4";
    form.append("model", model);
    form.append("language_code", opts.language ? BCP47[opts.language] : "unknown");
    if (model === "saaras:v4") form.append("keyterms", JSON.stringify((opts.keyterms ?? KEYTERMS).slice(0, 50)));
    const res = await fetch(`${BASE}/speech-to-text`, { method: "POST", headers: { "api-subscription-key": key() }, body: form });
    if (!res.ok) throw new Error(`sarvam_stt_${res.status}`);
    const json = (await res.json()) as { transcript: string; language_code: string | null };
    return { text: json.transcript.trim(), language: (json.language_code && FROM_BCP47[json.language_code]) || opts.language, provider: this.name };
  }
}

/** Split on sentence ends so no request exceeds the model's character limit. */
export function chunkForTts(text: string, max = TTS_MAX): string[] {
  const parts = text.split(/(?<=[.!?।۔。])\s+/);
  const out: string[] = [];
  let cur = "";
  for (const p of parts) {
    if ((cur + " " + p).trim().length > max && cur) { out.push(cur.trim()); cur = ""; }
    cur += " " + p;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.flatMap((c) => (c.length > max ? c.match(new RegExp(`.{1,${max}}`, "gs")) ?? [] : [c]));
}

export class SarvamTextToSpeech implements TextToSpeech {
  readonly name = "sarvam";
  async synthesize(text: string, opts: { language: Lang }) {
    const buffers: Buffer[] = [];
    for (const chunk of chunkForTts(text)) {
      const res = await fetch(`${BASE}/text-to-speech`, {
        method: "POST",
        headers: { "api-subscription-key": key(), "content-type": "application/json" },
        body: JSON.stringify({
          text: chunk, language_code: BCP47[opts.language], model: process.env.SARVAM_TTS_MODEL ?? "bulbul:v3",
          speaker: process.env.SARVAM_TTS_SPEAKER || undefined, output_audio_codec: "mp3", enable_preprocessing: true,
        }),
      });
      if (!res.ok) throw new Error(`sarvam_tts_${res.status}`);
      const json = (await res.json()) as { audios: string[] };
      buffers.push(...json.audios.map((a) => Buffer.from(a, "base64")));
    }
    // MP3 frames concatenate into a playable stream.
    return { audio: Buffer.concat(buffers), mime: "audio/mpeg", provider: this.name };
  }
}
