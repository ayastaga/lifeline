import { runTurn, type TurnEvent } from "../ai/orchestrator";
import type { ChatProvider } from "../ai/provider";
import { t, type Lang } from "../i18n";
import type { Store } from "../store/types";
import { sttFor, ttsFor } from "./router";
import { KEYTERMS, type SpeechToText, type TextToSpeech } from "./types";

/** Turn the verified reply into something good to listen to. Same claims, no new content. */
export function toSpoken(text: string, lang: Lang, hasSources: boolean): string {
  const plain = text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/^\s*(?:[-*•]|\d+[.)])\s+/gm, "")
    .replace(/\n{2,}/g, " ")
    .replace(/\n/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return hasSources ? `${plain} ${t(lang, "voice.sources_on_screen")}` : plain;
}

export type VoiceTurnResult = {
  transcript: string;
  inputLanguage: Lang | undefined;
  replyLanguage: Lang;
  text: string;
  citations: { url: string; title: string | null }[];
  refused: boolean;
  pendingKeys: string[];
  readback: string | null;
  replacedSentences: number;
  audio: { base64: string; mime: string } | null;
  providers: { stt: string; tts: string | null };
};

/**
 * speech -> text -> (the same verified pipeline as typed chat) -> speech.
 * The transcript is the only thing the voice layer contributes.
 */
export async function voiceTurn(args: {
  audio: Buffer; mime: string; store: Store; provider: ChatProvider;
  inputLanguage?: Lang; replyLanguage?: Lang; replyMode: "audio" | "text";
  stt?: SpeechToText; tts?: TextToSpeech; onEvent?: (e: TurnEvent | { type: "transcript"; text: string }) => void; today?: string;
}): Promise<VoiceTurnResult> {
  const stt = args.stt ?? sttFor(args.inputLanguage);
  const heard = await stt.transcribe(args.audio, { mime: args.mime, language: args.inputLanguage, keyterms: KEYTERMS });
  args.onEvent?.({ type: "transcript", text: heard.text });
  const inputLanguage = args.inputLanguage ?? heard.language;
  const turn = await runTurn({
    message: heard.text, store: args.store, provider: args.provider, onEvent: args.onEvent,
    inputMode: "voice", inputLanguage, replyLanguage: args.replyLanguage, today: args.today,
  });
  let audio: VoiceTurnResult["audio"] = null;
  let ttsName: string | null = null;
  if (args.replyMode === "audio") {
    const tts = args.tts ?? ttsFor(turn.replyLanguage);
    const spoken = await tts.synthesize(toSpoken(turn.text, turn.replyLanguage, turn.citations.length > 0), { language: turn.replyLanguage });
    audio = { base64: spoken.audio.toString("base64"), mime: spoken.mime };
    ttsName = tts.name;
  }
  return {
    transcript: heard.text, inputLanguage, replyLanguage: turn.replyLanguage, text: turn.text, citations: turn.citations,
    refused: turn.refused, pendingKeys: turn.pendingKeys, readback: turn.readback, replacedSentences: turn.replacedSentences.length,
    audio, providers: { stt: stt.name, tts: ttsName },
  };
}
