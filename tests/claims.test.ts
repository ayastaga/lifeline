import { describe, expect, it } from "vitest";
import { detectConflicts, factClaim, factStatus, weakest } from "@/lib/claims";
import { buildRoadmap } from "@/lib/roadmap";
import { nextQuestions } from "@/lib/profile/nextQuestions";

const family = {
  province: "ON", age: 34, status: "permanent_resident", arrivalYear: 2024, maritalStatus: "married",
  children: [{ age: 6, hasResp: false }, { age: 3, hasResp: false }], householdIncomeBand: "60k_90k", incomeBand: "60k_90k",
  firstTimeHomeBuyer: true, hasTfsa: false, hasFhsa: false, housing: "rent", filedTaxesLastYear: true, hasEmploymentIncome: true,
} as never;

describe("claims", () => {
  it("official facts with a quote are verified; secondary ones are not", () => {
    expect(factStatus("tfsa_dollar_limits", 2026)).toBe("verified");
    expect(factStatus("fhsa_min_age", 2026)).toBe("unverified");
    expect(factClaim("tfsa_dollar_limits", 2026).sources[0]).toMatchObject({ tier: 1, quote: expect.stringContaining("2024 to 2026 $7,000") });
  });
  it("a fact for a past tax year 'may have changed' once the year rolls over", () => {
    expect(factStatus("tfsa_dollar_limits", 2027)).toBe("may_have_changed");
  });
  it("the weakest input decides a calculation's status", () => {
    expect(weakest(["verified", "unverified", "verified"])).toBe("unverified");
  });
  it("conflicting values for one fact are both marked conflict", () => {
    const a = factClaim("fhsa_annual_limit", 2026);
    const b = { ...a, id: "live:x", params: { ...a.params, value: 9000 } };
    expect(detectConflicts([a, b]).map((c) => c.status)).toEqual(["conflict", "conflict"]);
  });
});

describe("roadmap", () => {
  const rm = buildRoadmap(family, { currentYear: 2026 });
  const item = (id: string) => [...rm.items, ...rm.needsFact, ...rm.notForYou].find((i) => i.programId === id)!;
  it("orders by tier: unlock-money items before accounts", () => {
    const tiers = rm.items.map((i) => i.tier);
    expect([...tiers].sort((a, b) => a - b)).toEqual(tiers);
    expect(rm.items[0].tier).toBe(1);
  });
  it("TFSA: why shows what you told us, the assumption, the calculation and the CRA rule", () => {
    const tfsa = item("tfsa");
    expect(tfsa.why.youToldMe.map((f) => f.key)).toEqual(expect.arrayContaining(["age", "arrivalYear", "hasTfsa"]));
    expect(tfsa.why.derived.map((c) => c.key)).toEqual(expect.arrayContaining(["residency_start_assumed_from_arrival", "tfsa_room"]));
    const calc = tfsa.claims.find((c) => c.kind === "calculation")!;
    expect(calc).toMatchObject({ status: "calculated", params: expect.objectContaining({ room_accumulated: 21000, available_room: 21000 }) });
    expect(tfsa.why.rules.some((c) => c.key === "tfsa_newcomer_rule" && c.sources[0].quote)).toBe(true);
  });
  it("RESP: one calculation per child, with the newcomer residency assumption", () => {
    const resp = item("resp_cesg");
    expect(resp.claims.filter((c) => c.kind === "calculation")).toHaveLength(2);
    expect(resp.why.derived.filter((c) => c.key === "child_residency_assumed_from_family_arrival")).toHaveLength(2);
  });
  it("needs-fact items say exactly what's missing", () => {
    expect(item("cdcp").why.unknown).toEqual(["hasDentalInsurance"]);
  });
  it("unknown TFSA contributions -> calculation needs a fact, not a guess", () => {
    const rm2 = buildRoadmap({ ...(family as object), hasTfsa: true } as never, { currentYear: 2026 });
    const tfsa = rm2.items.find((i) => i.programId === "tfsa")!;
    expect(tfsa.why.unknown).toContain("tfsaContributedTotal");
    expect(tfsa.claims.find((c) => c.kind === "calculation")!.params.available_room).toBeNull();
  });
});

describe("next questions", () => {
  it("starts with the foundation facts when nothing is known", () => {
    expect(nextQuestions({}, new Set(), { currentYear: 2026 }).map((q) => q.key)).toEqual(["age", "province", "status"]);
  });
  it("then asks what unblocks the most, skipping excluded keys", () => {
    const q = nextQuestions(family, new Set(["selfEmployed"]), { currentYear: 2026 });
    expect(q.map((x) => x.key)).not.toContain("selfEmployed");
    expect(q[0].unblocks.length).toBeGreaterThan(0);
  });
});

describe("claim rendering (shared by web and mobile)", () => {
  it("renders the TFSA calculation and the residency assumption as i18n lines", async () => {
    const { claimLines, formatLine } = await import("@/lib/claims/render");
    const tfsa = buildRoadmap(family, { currentYear: 2026 }).items.find((i) => i.programId === "tfsa")!;
    const lines = tfsa.why.derived.flatMap(claimLines);
    expect(lines.map((l) => l.key)).toEqual(["assume.residency_start_assumed_from_arrival", "calc.tfsa_room", "calc.tfsa_room.available"]);
    expect(formatLine(lines[1], (n) => `$${n}`)).toEqual({ first: "2024", room: "$21000" });
  });
});
