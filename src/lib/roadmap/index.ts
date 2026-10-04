import { calculate, type CalcResult, type CalculatorName } from "../calculators";
import { calcClaim, factClaim, type Claim, tierOf } from "../claims";
import { estimateFor, type PlanItem } from "../plan";
import { evaluate, type PartialProfile } from "../rules/engine";
import { getProgram } from "../rules/programs";
import type { Program, RoadmapTier } from "../rules/types";
import { lookupFact } from "../facts";

// The roadmap: engine results turned into items a person can act on, each
// with the claims behind it and a plain "why am I seeing this?".

export type Why = {
  youToldMe: { key: string; value: unknown }[];
  derived: Claim[];      // assumptions and calculations made from what you told us
  rules: Claim[];        // facts and rules from official sources
  unknown: string[];     // profile keys that would change or complete this item
};

export type RoadmapItem = PlanItem & { tier: RoadmapTier; claims: Claim[]; why: Why };
export type Roadmap = {
  items: RoadmapItem[];         // eligible / likely, ordered by tier then value
  needsFact: RoadmapItem[];     // could apply: one or more answers missing
  notForYou: RoadmapItem[];
  totalAnnualMax: number;
  currentYear: number;
};

type CalcPlan = { id: string; name: CalculatorName; inputs: Record<string, number>; userFacts: string[]; facts: string[]; assumptions: Claim[]; needs: string[] };

function assumption(id: string, key: string, params: Claim["params"], userFacts: string[]): Claim {
  return { id, kind: "assumption", key, params, sources: [], appliesTo: { jurisdiction: "CA" }, dependsOn: { userFacts, facts: [] }, status: "calculated", reviewed: false };
}

const set = (o: Record<string, number>, k: string, v: number | undefined | null) => { if (v !== undefined && v !== null) o[k] = v; };

/** Map the confirmed profile to calculator inputs, recording derived facts and what's still unknown. */
function calcPlans(program: Program, p: PartialProfile, currentYear: number): CalcPlan[] {
  switch (program.calculator) {
    case "tfsa_room": {
      const inputs: Record<string, number> = { current_year: currentYear };
      const userFacts: string[] = [], assumptions: Claim[] = [], needs: string[] = [];
      if (p.birthYear) { inputs.birth_year = p.birthYear; userFacts.push("birthYear"); } else if (p.age) { inputs.age = p.age; userFacts.push("age"); } else needs.push("birthYear");
      if (p.alwaysLivedInCanada) { inputs.always_resident = 1; userFacts.push("alwaysLivedInCanada"); }
      else if (p.residencyStartYear) { inputs.residency_start_year = p.residencyStartYear; userFacts.push("residencyStartYear"); }
      else if (p.arrivalYear) {
        inputs.residency_start_year = p.arrivalYear; userFacts.push("arrivalYear");
        assumptions.push(assumption("assume:residency_from_arrival", "residency_start_assumed_from_arrival", { year: p.arrivalYear }, ["arrivalYear"]));
      } else needs.push("alwaysLivedInCanada", "residencyStartYear");
      if (p.hasTfsa === false) { inputs.contributed_total = 0; userFacts.push("hasTfsa"); }
      else if (p.tfsaContributedTotal !== undefined) { inputs.contributed_total = p.tfsaContributedTotal; userFacts.push("tfsaContributedTotal"); }
      else needs.push(p.hasTfsa === undefined ? "hasTfsa" : "tfsaContributedTotal");
      return [{ id: "calc:tfsa_room", name: "tfsa_room", inputs, userFacts, facts: ["tfsa_dollar_limits", "tfsa_min_age", "tfsa_newcomer_rule"], assumptions, needs }];
    }
    case "fhsa_room": {
      const inputs: Record<string, number> = { current_year: currentYear, has_fhsa: p.hasFhsa ? 1 : 0 };
      const userFacts = p.hasFhsa !== undefined ? ["hasFhsa"] : [];
      const needs: string[] = p.hasFhsa === undefined ? ["hasFhsa"] : [];
      if (p.hasFhsa) {
        if (p.fhsaOpenedYear) { inputs.opened_year = p.fhsaOpenedYear; userFacts.push("fhsaOpenedYear"); } else needs.push("fhsaOpenedYear");
        if (p.fhsaContributedTotal !== undefined) { inputs.contributed_total = p.fhsaContributedTotal; userFacts.push("fhsaContributedTotal"); } else needs.push("fhsaContributedTotal");
      }
      return [{ id: "calc:fhsa_room", name: "fhsa_room", inputs, userFacts, facts: ["fhsa_annual_limit", "fhsa_lifetime_limit", "fhsa_carry_forward_max", "fhsa_room_starts_when_opened"], assumptions: [], needs }];
    }
    case "resp_catch_up": {
      return (p.children ?? []).map((c, i) => ({ c, i })).filter(({ c }) => c.age < 18).map(({ c, i }) => {
        const inputs: Record<string, number> = { current_year: currentYear };
        const assumptions: Claim[] = [];
        set(inputs, "child_birth_year", c.birthYear);
        if (!c.birthYear) inputs.child_age = c.age;
        const born = c.birthYear ?? currentYear - c.age;
        if (c.residencyStartYear) inputs.child_residency_start_year = c.residencyStartYear;
        else if (!p.alwaysLivedInCanada && p.arrivalYear && born < p.arrivalYear) {
          inputs.child_residency_start_year = p.arrivalYear;
          assumptions.push(assumption(`assume:child${i}_residency`, "child_residency_assumed_from_family_arrival", { child: i + 1, year: p.arrivalYear }, ["arrivalYear", "children"]));
        }
        if (c.grantsReceived !== undefined) inputs.grants_received = c.grantsReceived;
        else if (c.hasResp === false) inputs.grants_received = 0;
        return {
          id: `calc:resp_catch_up:${i}`, name: "resp_catch_up" as const, inputs, userFacts: ["children"],
          facts: ["cesg_annual_room", "cesg_last_age", "cesg_age_16_17_cutoff_age", "cesg_annual_max_with_carry_forward", "cesg_lifetime_max", "cesg_match_rate"],
          assumptions, needs: c.hasResp === undefined ? ["children.hasResp"] : [],
        };
      });
    }
    default:
      return [];
  }
}

export function buildItem(program: Program, profile: PartialProfile, currentYear: number): RoadmapItem {
  const [r] = evaluate(profile, [program.id]);
  const claims: Claim[] = [];
  claims.push({
    id: `eligibility:${program.id}`, kind: "eligibility", key: `reason.${r.reason}`, params: { status: r.status, program: program.id },
    sources: [{ url: program.apply_url, tier: tierOf(program.apply_url) }], appliesTo: { jurisdiction: program.jurisdiction === "ON" ? "ON" : "CA" },
    dependsOn: { userFacts: r.usedFacts, facts: [] }, status: r.status === "need_more_info" ? "needs_fact" : "calculated", reviewed: !program.verify,
  });
  const rules = program.fact_keys.filter((k) => lookupFact(k).status !== "not_found").map((k) => factClaim(k, currentYear));
  claims.push(...rules);

  const derived: Claim[] = [];
  const unknown = new Set<string>(r.missing);
  const userFactKeys = new Set<string>(r.usedFacts);
  if (r.status === "eligible" || r.status === "likely") {
    for (const cp of calcPlans(program, profile, currentYear)) {
      cp.needs.forEach((k) => unknown.add(k));
      cp.userFacts.forEach((k) => userFactKeys.add(k));
      derived.push(...cp.assumptions);
      const result: CalcResult = calculate(cp.name, cp.inputs);
      derived.push(calcClaim(cp.id, result, { userFacts: cp.userFacts, facts: cp.facts }, currentYear));
    }
  }
  claims.push(...derived);

  const dl = program.plan_item.deadline ? lookupFact(program.plan_item.deadline) : null;
  const base: PlanItem = {
    ...r,
    titleKey: program.plan_item.title_key,
    actionKey: program.plan_item.action_key,
    deadline: dl && dl.status === "ok" && typeof dl.value === "string" ? { key: dl.key, date: dl.value, sourceUrl: dl.sourceUrl } : null,
    estimate: r.status === "eligible" || r.status === "likely" ? estimateFor(program, profile) : null,
  };
  const youToldMe = [...userFactKeys].filter((k) => k in profile).map((k) => ({ key: k, value: (profile as Record<string, unknown>)[k] }));
  return { ...base, tier: program.roadmap_tier, claims, why: { youToldMe, derived, rules, unknown: [...unknown] } };
}

export function buildRoadmap(profile: PartialProfile, opts: { currentYear?: number; programIds?: string[] } = {}): Roadmap {
  const currentYear = opts.currentYear ?? new Date().getFullYear();
  const all = evaluate(profile, opts.programIds).map((r) => buildItem(getProgram(r.programId)!, profile, currentYear));
  const byValue = (a: RoadmapItem, b: RoadmapItem) => a.tier - b.tier || (b.estimate?.annualMax ?? 0) - (a.estimate?.annualMax ?? 0) || (a.status === "eligible" ? -1 : 1);
  const items = all.filter((i) => i.status === "eligible" || i.status === "likely").sort(byValue);
  const needsFact = all.filter((i) => i.status === "need_more_info").sort((a, b) => a.tier - b.tier);
  const notForYou = all.filter((i) => i.status === "not_eligible");
  const totalAnnualMax = Math.round(items.reduce((s, i) => s + (i.estimate?.annualMax ?? 0), 0) * 100) / 100;
  return { items, needsFact, notForYou, totalAnnualMax, currentYear };
}
