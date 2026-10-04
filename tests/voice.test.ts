import { describe, expect, it } from "vitest";
import type { AssistantMessage, ChatProvider } from "@/lib/ai/provider";
import { chunkForTts } from "@/lib/speech/sarvam";
import { toSpoken, voiceTurn } from "@/lib/speech/turn";
import type { SpeechToText, TextToSpeech } from "@/lib/speech/types";
import { MemoryStore } from "@/lib/store/memory";

function scripted(steps: Partial<AssistantMessage>[]): ChatProvider & { seen: { content: string }[][] } {
  let i = 0;
  const seen: { content: string }[][] = [];
  return {
    name: "scripted", model: "scripted", seen,
    async complete({ messages }) {
      seen.push(messages as never);
      return { role: "assistant", content: null, refusal: null, ...steps[Math.min(i++, steps.length - 1)] } as AssistantMessage;
    },
  };
}
const call = (id: string, name: string, args: object) => ({ id, type: "function" as const, function: { name, arguments: JSON.stringify(args) } });
const fakeStt = (text: string, language?: "hi" | "pa"): SpeechToText & { calls: unknown[] } => {
  const calls: unknown[] = [];
  return { name: "fake-stt", calls, async transcribe(_a, opts) { calls.push(opts); return { text, language: language ?? opts.language, provider: "fake" }; } };
};
const fakeTts = (): TextToSpeech & { spoken: string[] } => {
  const spoken: string[] = [];
  return { name: "fake-tts", spoken, async synthesize(text) { spoken.push(text); return { audio: Buffer.from("mp3"), mime: "audio/mpeg", provider: "fake" }; } };
};
let n = 0;
const store = (profile?: object) => new MemoryStore(`voice-${n++}`, { profile: profile as never });

describe("voice turn", () => {
  it("speak Hindi -> facts staged as spoken -> code reads them back in Hindi -> audio", async () => {
    const stt = fakeStt("मैं 2024 में कनाडा आया, मेरी उम्र 34 है", "hi");
    const tts = fakeTts();
    const s = store();
    const provider = scripted([
      { tool_calls: [call("1", "update_profile", { facts: [{ key: "arrivalYear", value: 2024 }, { key: "age", value: 34 }] })] },
      { content: "धन्यवाद! कृपया अपने प्रोफ़ाइल कार्ड पर पुष्टि करें।" },
    ]);
    const r = await voiceTurn({ audio: Buffer.from("x"), mime: "audio/m4a", store: s, provider, inputLanguage: "hi", replyMode: "audio", stt, tts, today: "2026-10-04" });
    expect(r.inputLanguage).toBe("hi");
    expect(r.readback).toContain("मैंने सुना");
    expect(r.readback).toContain("2024");
    expect(r.text.endsWith(r.readback!)).toBe(true);
    expect((await s.getProfile()).pending.map((p) => p.source)).toEqual(["spoken", "spoken"]);
    expect((await s.getProfile()).confirmed).toEqual({}); // nothing counts until confirmed
    expect(tts.spoken[0]).toContain("मैंने सुना");
    expect(r.audio?.mime).toBe("audio/mpeg");
    expect((stt.calls[0] as { keyterms: string[] }).keyterms).toContain("TFSA");
  });

  it("speak Punjabi, read English: reply language is independent", async () => {
    const provider = scripted([{ content: "Hi! Tell me about yourself." }]);
    const r = await voiceTurn({ audio: Buffer.from("x"), mime: "audio/m4a", store: store(), provider, inputLanguage: "pa", replyLanguage: "en", replyMode: "text", stt: fakeStt("ਸਤ ਸ੍ਰੀ ਅਕਾਲ"), tts: fakeTts() });
    expect(r).toMatchObject({ inputLanguage: "pa", replyLanguage: "en", audio: null });
    const sys = provider.seen[0][0].content;
    expect(sys).toContain("Reply language: English");
    expect(sys).toContain("They spoke in Punjabi");
    expect(sys).toContain("read aloud");
  });

  it("the voice layer can't change the answer: spoken text = verified text, minus formatting", async () => {
    const tts = fakeTts();
    const provider = scripted([
      { tool_calls: [call("1", "lookup_fact", { key: "fhsa_annual_limit" })] },
      { content: "**FHSA:**\n- You can put in $8,000 a year.\n- That's about $667 a month." },
    ]);
    const r = await voiceTurn({ audio: Buffer.from("x"), mime: "audio/m4a", store: store(), provider, inputLanguage: "hi", replyLanguage: "en", replyMode: "audio", stt: fakeStt("FHSA kitna hai"), tts });
    expect(r.replacedSentences).toBe(1); // the model's own arithmetic was removed before anything was spoken
    expect(tts.spoken[0]).not.toContain("667");
    expect(tts.spoken[0]).toContain("$8,000");
    expect(tts.spoken[0]).toContain("The sources are on your screen.");
  });

  it("typed input gets no read-back", async () => {
    const { runTurn } = await import("@/lib/ai/orchestrator");
    const provider = scripted([{ tool_calls: [call("1", "update_profile", { facts: [{ key: "age", value: 34 }] })] }, { content: "Thanks." }]);
    const r = await runTurn({ message: "I'm 34", store: store(), provider });
    expect(r.readback).toBeNull();
  });
});

describe("speech helpers", () => {
  it("toSpoken strips markdown and list markers", () => {
    expect(toSpoken("**Hi**\n- one\n1. two", "en", false)).toBe("Hi one two");
  });
  it("chunkForTts keeps every request under the limit and loses nothing", () => {
    const text = Array.from({ length: 60 }, (_, i) => `Sentence number ${i} is here.`).join(" ");
    const chunks = chunkForTts(text, 200);
    expect(chunks.every((c) => c.length <= 200)).toBe(true);
    expect(chunks.join(" ").replace(/\s+/g, " ")).toBe(text);
  });
});
