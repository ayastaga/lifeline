import type { Lang } from "../i18n/detect";
import { OpenAISpeechToText, OpenAITextToSpeech } from "./openai";
import { SarvamSpeechToText, SarvamTextToSpeech } from "./sarvam";
import type { SpeechToText, TextToSpeech } from "./types";

// Pick speech providers per language. Defaults: Sarvam for Hindi and Punjabi
// (when SARVAM_API_KEY is set), OpenAI for everything else. Override with
// SPEECH_STT_ROUTES / SPEECH_TTS_ROUTES, e.g. {"hi":"sarvam","default":"openai"}.
// Choose by our own audio test set, not vendor benchmarks.

type Route = "openai" | "sarvam";
const DEFAULTS: Record<string, Route> = { hi: "sarvam", pa: "sarvam", default: "openai" };

function routes(env: string | undefined): Record<string, Route> {
  try { return { ...DEFAULTS, ...(env ? JSON.parse(env) : {}) }; } catch { return DEFAULTS; }
}
function pick(table: Record<string, Route>, lang?: Lang): Route {
  const r = (lang && table[lang]) || table.default || "openai";
  return r === "sarvam" && !process.env.SARVAM_API_KEY ? "openai" : r;
}

export function sttFor(lang?: Lang): SpeechToText {
  return pick(routes(process.env.SPEECH_STT_ROUTES), lang) === "sarvam" ? new SarvamSpeechToText() : new OpenAISpeechToText();
}
export function ttsFor(lang: Lang): TextToSpeech {
  return pick(routes(process.env.SPEECH_TTS_ROUTES), lang) === "sarvam" ? new SarvamTextToSpeech() : new OpenAITextToSpeech();
}
