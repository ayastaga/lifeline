import { describe, expect, it } from "vitest";
import { evaluate, evaluateProgram, matchCondition } from "@/lib/rules/engine";
import { getProgram } from "@/lib/rules/programs";
import { buildPlan } from "@/lib/plan";

const get = (id: string) => getProgram(id)!;
const status = (id: string, p: object) => evaluateProgram(get(id), p as never);

describe("operators", () => {
  it("unknown fields never satisfy positive tests", () => {
    expect(matchCondition({}, { age: { lt: 19 } })).toBe(false);
    expect(matchCondition({}, { selfEmployed: false })).toBe(false);
  });
  it("ne is true for unknown", () => {
    expect(matchCondition({}, { selfEmployed: { ne: true } })).toBe(true);
  });
  it("any / none / len", () => {
    const kids = { children: [{ age: 2, hasResp: false }, { age: 19 }] };
    expect(matchCondition(kids, { children: { any: { age: { lt: 18 }, hasResp: false } } })).toBe(true);
    expect(matchCondition(kids, { children: { none: { age: { lt: 1 } } } })).toBe(true);
    expect(matchCondition({ children: [] }, { children: { len: 0 } })).toBe(true);
  });
});

describe("requires gate", () => {
  it("returns need_more_info with missing keys before evaluating rules", () => {
    const r = status("gst_hst_credit", { province: "ON" });
    expect(r.status).toBe("need_more_info");
    expect(r.missing).toEqual(expect.arrayContaining(["age", "incomeBand", "filedTaxesLastYear", "status"]));
  });
  it("missing children key is unknown, not 'no children'", () => {
    expect(status("resp_cesg", {}).status).toBe("need_more_info");
    expect(status("resp_cesg", { children: [] }).status).toBe("not_eligible");
  });
});

describe("programs", () => {
  const student = { province: "ON", status: "study_permit", age: 20, isStudent: true, incomeBand: "under_20k", filedTaxesLastYear: false, personas: ["student"], children: [] };
  it("international student who hasn't filed: CGEB likely via RC151", () => {
    const r = status("gst_hst_credit", student);
    expect(r).toMatchObject({ status: "likely", reason: "newcomer_apply_rc151" });
  });
  it("OSAP excludes study permit holders", () => {
    expect(status("osap", student).reason).toBe("osap_residency_status");
  });
  it("CCB: work permit is 'likely' (18-month rule), refugee claimant not yet", () => {
    const base = { children: [{ age: 2 }] };
    expect(status("ccb", { ...base, status: "work_permit" }).reason).toBe("temporary_resident_18_month_rule");
    expect(status("ccb", { ...base, status: "refugee_claimant" }).status).toBe("not_eligible");
    expect(status("ccb", { ...base, status: "citizen" }).status).toBe("eligible");
    expect(status("ccb", { children: [{ age: 19 }], status: "citizen" }).reason).toBe("children_over_17");
  });
  it("HST: ride-share drivers must register regardless of revenue", () => {
    expect(status("hst_registration", { selfEmployed: true, selfEmploymentRevenueBand: "under_20k", rideshareDriver: true }).reason).toBe("rideshare_must_register");
    expect(status("hst_registration", { selfEmployed: true, selfEmploymentRevenueBand: "under_20k" }).reason).toBe("below_small_supplier_threshold");
    expect(status("hst_registration", { selfEmployed: true, selfEmploymentRevenueBand: "20k_40k" }).status).toBe("need_more_info");
  });
  it("CWB counts self-employment as working income", () => {
    expect(status("cwb", { age: 30, hasEmploymentIncome: false, incomeBand: "20k_40k" }).status).toBe("not_eligible");
    expect(status("cwb", { age: 30, hasEmploymentIncome: false, selfEmployed: true, incomeBand: "20k_40k" }).status).toBe("eligible");
  });
  it("Canada Training Credit age window", () => {
    expect(status("canada_training_credit", { age: 22, incomeBand: "20k_40k" }).reason).toBe("age_requirement");
    expect(status("canada_training_credit", { age: 30, incomeBand: "20k_40k" }).status).toBe("eligible");
  });
  it("no persona tracks: every program is evaluated, rules decide relevance", () => {
    const ids = evaluate({ personas: ["gig"] }).map((r) => r.programId);
    expect(ids).toContain("hst_registration");
    expect(ids).toContain("ccb");
    expect(ids).toContain("tfsa");
  });
  it("records which user facts a decision used", () => {
    const r = status("ccb", { children: [{ age: 2 }], status: "work_permit", province: "ON" });
    expect(r.usedFacts).toEqual(expect.arrayContaining(["children", "status"]));
    expect(r.usedFacts).not.toContain("province");
  });
});

describe("plan", () => {
  it("demo family: estimates come only from facts and sum correctly", () => {
    const plan = buildPlan({
      province: "ON", status: "work_permit", age: 31, maritalStatus: "married", children: [{ age: 2, hasResp: false }],
      householdIncomeBand: "40k_60k", incomeBand: "40k_60k", filedTaxesLastYear: false, housing: "rent", personas: ["family", "newcomer"],
      hasDentalInsurance: false, paidChildcareThisYear: false, hasEmploymentIncome: true, arrivalYear: 2025,
    });
    const byId = Object.fromEntries(plan.items.map((i) => [i.programId, i]));
    expect(byId.ccb.estimate?.annualMax).toBe(8157);
    expect(byId.resp_cesg.estimate).toMatchObject({ annualMax: 500, conditional: true });
    expect(byId.gst_hst_credit.estimate?.annualMax).toBe(890 + 234);
    const sum = plan.items.reduce((s, i) => s + (i.estimate?.annualMax ?? 0), 0);
    expect(plan.totalAnnualMax).toBeCloseTo(sum, 2);
    // Sorted: eligible/likely before not_eligible
    const order = plan.items.map((i) => i.status);
    expect(order.indexOf("not_eligible") === -1 || order.lastIndexOf("eligible") < order.indexOf("not_eligible")).toBe(true);
  });
});
