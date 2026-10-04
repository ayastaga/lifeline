import { config } from "dotenv";
import { describe, expect, it } from "vitest";
import { runTurn } from "@/lib/ai/orchestrator";
import { getProvider } from "@/lib/ai/provider";
import { detectLanguage, type Lang } from "@/lib/i18n/detect";
import { MemoryStore } from "@/lib/store/memory";
import cases from "./questions.json";

config({ path: ".env.local" });

// Full pipeline against the pinned model at temperature 0. Skipped without a key.
type Case = {
  id: string; language: Lang; profile: Record<string, unknown>; question: string;
  expect: {
    tools_called?: string[]; programs_mentioned?: string[]; must_include_citation?: boolean;
    must_not_state_numbers_without_lookup?: boolean; reply_language?: Lang; reply_script?: string; must_refuse?: boolean;
  };
};

const hasKey = !!process.env.OPENAI_API_KEY;

describe.skipIf(!hasKey)("golden questions", () => {
  it.each(cases as Case[])("$id", async (c) => {
    const store = new MemoryStore(`golden-${c.id}`, { profile: c.profile as never, language: c.language });
    const r = await runTurn({ message: c.question, store, provider: getProvider(), persist: false, today: "2026-10-03" });
    const tools = r.toolCalls.map((t) => t.tool);
    const e = c.expect;

    if (e.must_refuse) {
      expect(r.refused, "refused").toBe(true);
      expect(tools, "no tools on refusal").toEqual([]);
      return;
    }
    expect(r.refused, "should not refuse").toBe(false);
    for (const t of e.tools_called ?? []) expect(tools, `tool ${t}`).toContain(t);
    if (e.programs_mentioned) {
      const surfaced = r.toolCalls
        .filter((t) => t.tool === "check_eligibility")
        .flatMap((t) => ((t.output as { results?: { programId: string; status: string }[] }).results ?? []))
        .filter((x) => x.status !== "not_eligible")
        .map((x) => x.programId);
      for (const p of e.programs_mentioned) expect(surfaced, `program ${p}`).toContain(p);
    }
    if (e.must_include_citation) expect(r.citations.length, "citations").toBeGreaterThan(0);
    if (e.must_not_state_numbers_without_lookup) expect(r.replacedSentences, "model stated unchecked numbers").toEqual([]);
    if (e.reply_language || e.reply_script) {
      const d = detectLanguage(r.text, c.language);
      if (e.reply_language) expect(d.language, "reply language").toBe(e.reply_language);
      if (e.reply_script) expect(d.script, "reply script").toBe(e.reply_script);
    }
  });
});
