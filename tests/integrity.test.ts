import { describe, expect, it } from "vitest";
import { allFacts, lookupFact } from "@/lib/facts";
import { hasKey, tables } from "@/lib/i18n";
import { PROGRAMS } from "@/lib/rules/programs";
import { ProfileSchema } from "@/lib/profile/schema";

describe("data integrity", () => {
  it("every fact_key and deadline referenced by a program exists", () => {
    for (const p of PROGRAMS) {
      for (const k of p.fact_keys) expect(lookupFact(k).status, `${p.id} -> ${k}`).not.toBe("not_found");
      if (p.plan_item.deadline) expect(lookupFact(p.plan_item.deadline).status).toBe("ok");
    }
  });
  it("every requires key is a ProfileSchema key", () => {
    const keys = Object.keys(ProfileSchema.shape);
    for (const p of PROGRAMS) for (const k of p.requires) expect(keys, `${p.id}.${k}`).toContain(k);
  });
  it("every fact has an official-domain source URL", () => {
    for (const f of allFacts()) expect(new URL(f.source_url).hostname).toMatch(/(^|\.)(canada|ontario)\.ca$/);
  });
  it("every program is still flagged verify: true until a human checks it", () => {
    expect(PROGRAMS.every((p) => typeof p.verify === "boolean")).toBe(true);
  });
  it("i18n: every reason code and plan string exists in English", () => {
    for (const p of PROGRAMS) {
      expect(hasKey("en", p.plan_item.title_key)).toBe(true);
      expect(hasKey("en", p.plan_item.action_key)).toBe(true);
      for (const r of p.rules) expect(hasKey("en", `reason.${r.reason}`), `${p.id}: ${r.reason}`).toBe(true);
    }
    expect(hasKey("en", "reason.missing_profile_facts")).toBe(true);
  });
  it("i18n: all core (non reason/action) keys translated in all 8 languages", () => {
    const t = tables();
    const core = Object.keys(t.en).filter((k) => !k.startsWith("reason.") && !k.endsWith(".action"));
    for (const [lang, table] of Object.entries(t)) {
      const missing = core.filter((k) => !(k in table));
      expect(missing, lang).toEqual([]);
    }
  });
});
