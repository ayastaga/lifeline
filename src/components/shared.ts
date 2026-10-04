"use client";
import type { Question } from "@/lib/profile/onboarding";
import type { Plan } from "@/lib/plan";
import type { Roadmap } from "@/lib/roadmap";
import type { RankedQuestion } from "@/lib/profile/nextQuestions";
import type { Lang } from "@/lib/i18n/detect";
import type { PendingFact } from "@/lib/store/types";

export type ProfileSnapshot = {
  confirmed: Record<string, unknown>;
  pending: PendingFact[];
  language: Lang;
  script: string | null;
  storage: "supabase" | "memory";
  nextQuestion: Question | null;
};
export type { Plan, Question, Lang };
export type RoadmapData = Roadmap & { nextQuestions: RankedQuestion[] };

export type ChatMsg = {
  id: string;
  role: "user" | "assistant";
  text: string;
  citations?: { url: string; title: string | null }[];
  refused?: boolean;
  replaced?: number;
  messageId?: string | null;
  error?: boolean;
  feedback?: "thumbs_up" | "thumbs_down";
};

export function scriptClass(text: string): string {
  if (/[\u0A00-\u0A7F]/.test(text)) return "script-guru";
  if (/[\u0900-\u097F]/.test(text)) return "script-deva";
  if (/[\u0600-\u06FF]/.test(text)) return "script-arab";
  if (/[\u4E00-\u9FFF]/.test(text)) return "script-hans";
  return "";
}

export function textDir(text: string): "rtl" | "ltr" | "auto" {
  return /[\u0600-\u06FF]/.test(text) ? "rtl" : "auto";
}
