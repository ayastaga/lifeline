import { lookupFact } from "../facts";
import { evaluate, type PartialProfile } from "../rules/engine";
import { getProgram } from "../rules/programs";
import type { EligibilityResult, EligibilityStatus, Program } from "../rules/types";

// Turns eligibility results into plan items with deadlines and an "up to"
// estimate. Estimates are maximums from the facts table, never predictions:
// actual amounts depend on income the CRA sees on the return.

export type PlanItem = EligibilityResult & {
  titleKey: string;
  actionKey: string;
  deadline: { key: string; date: string; sourceUrl: string } | null;
  estimate: { annualMax: number; basis: string; conditional: boolean; sourceUrls: string[] } | null;
};

export type Plan = {
  items: PlanItem[];
  totalAnnualMax: number;
  sourceUrls: string[];
};

const ORDER: Record<EligibilityStatus, number> = { eligible: 0, likely: 1, need_more_info: 2, not_eligible: 3 };

function n(key: string): { v: number; url: string } | null {
  const f = lookupFact(key);
  return f.status === "ok" && typeof f.value === "number" ? { v: f.value, url: f.sourceUrl } : null;
}

const partnered = (p: PartialProfile) => p.maritalStatus === "married" || p.maritalStatus === "common_law";
const kids = (p: PartialProfile, maxAgeExclusive: number) => (p.children ?? []).filter((c) => c.age < maxAgeExclusive);

export function estimateFor(program: Program, p: PartialProfile): PlanItem["estimate"] {
  switch (program.estimate) {
    case "cgeb": {
      const base = n(partnered(p) ? "cgeb_max_couple" : "cgeb_max_single");
      const child = n("cgeb_max_per_child");
      if (!base || !child) return null;
      return { annualMax: base.v + child.v * kids(p, 19).length, basis: "cgeb_max", conditional: false, sourceUrls: [base.url] };
    }
    case "ostc": {
      const m = n("ostc_max");
      if (!m) return null;
      const people = 1 + (partnered(p) ? 1 : 0) + (p.children?.length ?? 0);
      return { annualMax: m.v * people, basis: "ostc_max_per_person", conditional: false, sourceUrls: [m.url] };
    }
    case "cwb": {
      const m = n(partnered(p) || (p.children?.length ?? 0) > 0 ? "cwb_max_family" : "cwb_max_single");
      return m ? { annualMax: m.v, basis: "cwb_max", conditional: false, sourceUrls: [m.url] } : null;
    }
    case "ccb": {
      const u6 = n("ccb_max_under_6"), o6 = n("ccb_max_6_to_17");
      if (!u6 || !o6) return null;
      const total = (p.children ?? []).reduce((s, c) => s + (c.age < 6 ? u6.v : c.age < 18 ? o6.v : 0), 0);
      return { annualMax: total, basis: "ccb_max_by_age", conditional: false, sourceUrls: [u6.url] };
    }
    case "ocb": {
      const m = n("ocb_max_monthly_per_child");
      return m ? { annualMax: Math.round(m.v * 12 * kids(p, 18).length * 100) / 100, basis: "ocb_max", conditional: false, sourceUrls: [m.url] } : null;
    }
    case "cesg": {
      const m = n("cesg_annual_max");
      return m ? { annualMax: m.v * kids(p, 18).length, basis: "cesg_if_you_contribute", conditional: true, sourceUrls: [m.url] } : null;
    }
    case "clb": {
      const m = n("clb_first_payment");
      return m ? { annualMax: m.v * kids(p, 18).length, basis: "clb_first_year", conditional: true, sourceUrls: [m.url] } : null;
    }
    default:
      return null;
  }
}

export function buildPlan(profile: PartialProfile, programIds?: string[]): Plan {
  const results = evaluate(profile, programIds);
  const items: PlanItem[] = results.map((r) => {
    const program = getProgram(r.programId)!;
    const dl = program.plan_item.deadline ? lookupFact(program.plan_item.deadline) : null;
    const deadline =
      dl && dl.status === "ok" && typeof dl.value === "string" ? { key: dl.key, date: dl.value, sourceUrl: dl.sourceUrl } : null;
    const estimate = r.status === "eligible" || r.status === "likely" ? estimateFor(program, profile) : null;
    return { ...r, titleKey: program.plan_item.title_key, actionKey: program.plan_item.action_key, deadline, estimate };
  });
  items.sort((a, b) => ORDER[a.status] - ORDER[b.status]);
  const totalAnnualMax = items.reduce((s, i) => s + (i.estimate?.annualMax ?? 0), 0);
  const sourceUrls = [...new Set(items.flatMap((i) => [i.applyUrl, ...(i.estimate?.sourceUrls ?? [])]))];
  return { items, totalAnnualMax: Math.round(totalAnnualMax * 100) / 100, sourceUrls };
}
