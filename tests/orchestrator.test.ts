import { describe, expect, it } from "vitest";
import { runTurn } from "@/lib/ai/orchestrator";
import type { AssistantMessage, ChatProvider } from "@/lib/ai/provider";
import { MemoryStore } from "@/lib/store/memory";

// A scripted provider: returns the given assistant messages in order. Lets CI
// exercise routing -> tools -> composer without a model or network.
function scripted(steps: Partial<AssistantMessage>[]): ChatProvider & { seen: unknown[] } {
  let i = 0;
  const seen: unknown[] = [];
  return {
    name: "scripted", model: "scripted", seen,
    async complete({ messages }) {
      seen.push(messages);
      const s = steps[Math.min(i++, steps.length - 1)];
      return { role: "assistant", content: null, refusal: null, ...s } as AssistantMessage;
    },
  };
}
const call = (id: string, name: string, args: object) => ({ id, type: "function" as const, function: { name, arguments: JSON.stringify(args) } });
let n = 0;
const store = (profile?: object) => new MemoryStore(`test-${n++}`, { profile: profile as never });

describe("orchestrator pipeline (offline)", () => {
  it("RESP question: calculate -> answer with code-attached citation", async () => {
    const provider = scripted([
      { tool_calls: [call("1", "calculate", { calculator: "cesg_grant", inputs: { monthly_contribution: 100 } })] },
      { content: "If you put $100 a month into an RESP, the government adds $240 a year (20% of $1,200)." },
    ]);
    const r = await runTurn({ message: "If I put $100 a month in an RESP, how much does the government add?", store: store({ children: [{ age: 2 }] }), provider });
    expect(r.toolCalls.map((c) => c.tool)).toEqual(["calculate"]);
    expect(r.replacedSentences).toEqual([]);
    expect(r.citations.length).toBeGreaterThan(0);
    expect(r.text).toContain("$240");
  });

  it("model arithmetic is caught and replaced", async () => {
    const provider = scripted([
      { tool_calls: [call("1", "lookup_fact", { key: "ccb_max_under_6" })] },
      { content: "The maximum is $8,157 a year. That's about $680 a month." },
    ]);
    const r = await runTurn({ message: "How much is CCB?", store: store(), provider });
    expect(r.replacedSentences).toEqual(["That's about $680 a month."]);
    expect(r.text).toContain("$8,157");
  });

  it("update_profile stages facts as pending; eligibility ignores them", async () => {
    const s = store();
    const provider = scripted([
      { tool_calls: [call("1", "update_profile", { facts: [{ key: "status", value: "work_permit" }, { key: "children", value: [{ age: 2 }] }, { key: "province", value: "Narnia" }] }), call("2", "check_eligibility", { programIds: ["ccb"] })] },
      { content: "Thanks. Please confirm the details on your profile card." },
    ]);
    const r = await runTurn({ message: "I'm on a work permit with a 2-year-old", store: s, provider });
    const upd = r.toolCalls[0].output as { staged: { key: string }[]; rejected: { key: string }[] };
    expect(upd.staged.map((x) => x.key)).toEqual(["status", "children"]);
    expect(upd.rejected.map((x) => x.key)).toEqual(["province"]);
    const elig = r.toolCalls[1].output as { results: { status: string }[] };
    expect(elig.results[0].status).toBe("need_more_info"); // pending facts not used
    expect(r.pendingKeys).toEqual(["status", "children"]);
    expect((await s.getProfile()).confirmed).toEqual({});
  });

  it("refusal: no tools, marker stripped", async () => {
    const provider = scripted([{ content: "[[OUT_OF_SCOPE]] I can't recommend stocks." }]);
    const r = await runTurn({ message: "Should I buy Tesla stock?", store: store(), provider });
    expect(r).toMatchObject({ refused: true, toolCalls: [], citations: [] });
  });

  it("system prompt carries detected language and confirmed profile", async () => {
    const provider = scripted([{ content: "ਠੀਕ ਹੈ।" }]);
    await runTurn({ message: "ਮੈਨੂੰ ਕਿਹੜੇ ਲਾਭ ਮਿਲ ਸਕਦੇ ਹਨ?", store: store({ province: "ON" }), provider });
    const sys = (provider.seen[0] as { content: string }[])[0].content;
    expect(sys).toContain("Punjabi, written in Gurmukhi");
    expect(sys).toContain('"province":"ON"');
  });

  it("search_docs abstains cleanly when RAG is not configured", async () => {
    const provider = scripted([
      { tool_calls: [call("1", "search_docs", { query: "how does the ontario trillium benefit work", programId: "otb" })] },
      { content: "I'm not sure. The official page is linked below." },
    ]);
    const r = await runTurn({ message: "How does OTB work?", store: store(), provider });
    expect((r.toolCalls[0].output as { abstain: boolean }).abstain).toBe(true);
    expect(r.citations.map((c) => c.url)).toContain("https://www.ontario.ca/page/ontario-trillium-benefit");
  });
});
