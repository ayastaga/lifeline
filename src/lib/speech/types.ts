import type { Lang } from "../i18n/detect";

// The voice layer only transports the conversation. Speech-to-text turns audio
// into text; text-to-speech reads out text that has ALREADY been verified.
// Neither can add, change or answer anything.

export type Transcript = { text: string; language?: Lang; provider: string };
export type Speech = { audio: Buffer; mime: string; provider: string };

export interface SpeechToText {
  readonly name: string;
  transcribe(audio: Buffer, opts: { mime: string; language?: Lang; keyterms?: string[] }): Promise<Transcript>;
}
export interface TextToSpeech {
  readonly name: string;
  synthesize(text: string, opts: { language: Lang }): Promise<Speech>;
}

export const BCP47: Record<Lang, string> = { en: "en-IN", fr: "fr-CA", es: "es-ES", zh: "zh-CN", hi: "hi-IN", ur: "ur-IN", pa: "pa-IN", ar: "ar-SA" };

/** Domain words that speech-to-text should be biased toward (misheard acronyms break everything downstream). */
export const KEYTERMS = ["TFSA", "RESP", "FHSA", "RRSP", "CRA", "CESG", "Canada Learning Bond", "Canada Child Benefit", "Ontario Trillium Benefit", "GST", "HST", "SIN", "OSAP", "T4", "T2202", "My Account"];
