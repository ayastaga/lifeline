import OpenAI, { toFile } from "openai";
import { detectLanguage, type Lang } from "../i18n/detect";
import { KEYTERMS, type SpeechToText, type TextToSpeech } from "./types";

const NAMES: Record<Lang, string> = { en: "English", fr: "Canadian French", es: "Spanish", zh: "Mandarin Chinese", hi: "Hindi", ur: "Urdu", pa: "Punjabi", ar: "Arabic" };
const client = () => new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const ext = (mime: string) => (mime.includes("webm") ? "webm" : mime.includes("wav") ? "wav" : mime.includes("mpeg") || mime.includes("mp3") ? "mp3" : mime.includes("ogg") ? "ogg" : "m4a");

export class OpenAISpeechToText implements SpeechToText {
  readonly name = "openai";
  async transcribe(audio: Buffer, opts: { mime: string; language?: Lang; keyterms?: string[] }) {
    const res = await client().audio.transcriptions.create({
      file: await toFile(audio, `audio.${ext(opts.mime)}`, { type: opts.mime }),
      model: process.env.OPENAI_STT_MODEL ?? "gpt-4o-transcribe",
      language: opts.language,
      // A short prompt with domain vocabulary biases recognition of acronyms.
      prompt: `Canadian personal finance. Terms: ${(opts.keyterms ?? KEYTERMS).join(", ")}.`,
    });
    const text = res.text.trim();
    const detected = detectLanguage(text);
    // Leave unsupported languages unset so the orchestrator sees (and flags) them.
    return { text, language: opts.language ?? (detected.unsupported ? undefined : detected.language), provider: this.name };
  }
}

export class OpenAITextToSpeech implements TextToSpeech {
  readonly name = "openai";
  async synthesize(text: string, opts: { language: Lang }) {
    const res = await client().audio.speech.create({
      model: process.env.OPENAI_TTS_MODEL ?? "gpt-4o-mini-tts",
      voice: (process.env.OPENAI_TTS_VOICE ?? "alloy") as "alloy",
      input: text,
      instructions: `Speak in natural, warm, conversational ${NAMES[opts.language]}, like a helpful person explaining money to a neighbour. Not like a translation or an announcement. Read acronyms like TFSA letter by letter.`,
      response_format: "mp3",
    });
    return { audio: Buffer.from(await res.arrayBuffer()), mime: "audio/mpeg", provider: this.name };
  }
}
