// JSON shapes returned by the Lifeline API (see ../src/app/api). Kept local so
// the app doesn't pull server-only modules into the bundle.
import type { Claim } from "../../src/lib/claims";
export type { Claim };
export type Lang = "en" | "fr" | "zh" | "hi" | "ur" | "pa" | "ar" | "es";
export type Citation = { url: string; title: string | null };

export type RoadmapItem = {
  programId: string; name: string; kind: string; status: "eligible" | "likely" | "not_eligible" | "need_more_info"; reason: string;
  titleKey: string; actionKey: string; applyUrl: string; verified: boolean; tier: 1 | 2 | 3 | 4;
  deadline: { date: string } | null; estimate: { annualMax: number; conditional: boolean; basis: string } | null;
  claims: Claim[]; why: { youToldMe: { key: string; value: unknown }[]; derived: Claim[]; rules: Claim[]; unknown: string[] };
};
export type Roadmap = { items: RoadmapItem[]; needsFact: RoadmapItem[]; notForYou: RoadmapItem[]; totalAnnualMax: number; nextQuestions: { key: string }[] };
export type PendingFact = { key: string; value: unknown; source: "user" | "inferred" | "statement" | "spoken" };
export type ProfileSnapshot = { confirmed: Record<string, unknown>; pending: PendingFact[]; language: Lang };

export type VoiceResult = {
  transcript: string; replyLanguage: Lang; text: string; citations: Citation[]; refused: boolean;
  pendingKeys: string[]; readback: string | null; replacedSentences: number; audio: { base64: string; mime: string } | null;
};
export type Settings = { inputLanguage: Lang | "auto"; replyLanguage: Lang | "same"; replyMode: "audio" | "text" };
