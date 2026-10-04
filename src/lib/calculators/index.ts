import { FactMissingError, lookupFact, num } from "../facts";
import { fhsaRoom, respCatchUp, tfsaRoom } from "./accounts";

// Exact, deterministic math. Every rate comes from the facts table; every
// result lists the fact sources it used so the composer can cite them.

export type CalcResult = {
  calculator: string;
  ok: boolean;
  result: Record<string, number | boolean | string | null>;
  assumptions: string[];
  sources: string[];
  error?: string;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const uniq = (a: string[]) => [...new Set(a)];

function wrap(name: string, fn: () => Omit<CalcResult, "calculator" | "ok">): CalcResult {
  try {
    return { calculator: name, ok: true, ...fn() };
  } catch (e) {
    if (e instanceof FactMissingError) {
      const f = lookupFact(e.key);
      return {
        calculator: name, ok: false, result: {}, assumptions: [],
        sources: "sourceUrl" in f ? [f.sourceUrl] : [],
        error: `missing_fact:${e.key}`,
      };
    }
    return { calculator: name, ok: false, result: {}, assumptions: [], sources: [], error: (e as Error).message };
  }
}

/** RESP contribution -> basic Canada Education Savings Grant. */
export function cesgGrant(inputs: { monthly_contribution?: number; annual_contribution?: number; years?: number; has_unused_room?: number }): CalcResult {
  return wrap("cesg_grant", () => {
    const rate = num("cesg_match_rate");
    const yearMax = num(inputs.has_unused_room ? "cesg_annual_max_with_carry_forward" : "cesg_annual_max");
    const lifetime = num("cesg_lifetime_max");
    const forMax = num("cesg_annual_contribution_for_max");
    const annual = inputs.annual_contribution ?? (inputs.monthly_contribution ?? 0) * 12;
    if (annual < 0) throw new Error("negative_contribution");
    const years = Math.max(1, Math.floor(inputs.years ?? 1));
    const grantPerYear = Math.min(annual * (rate.value / 100), yearMax.value);
    const total = Math.min(grantPerYear * years, lifetime.value);
    return {
      result: {
        annual_contribution: r2(annual),
        grant_per_year: r2(grantPerYear),
        grant_per_month_equivalent: r2(grantPerYear / 12),
        years,
        total_grant: r2(total),
        hit_lifetime_cap: grantPerYear * years > lifetime.value,
        contribution_for_full_grant: forMax.value,
        match_rate_percent: rate.value,
        annual_grant_cap: yearMax.value,
        lifetime_cap: lifetime.value,
      },
      assumptions: [
        "Basic CESG only. Low-income families may also get the Additional CESG and the Canada Learning Bond, not included here.",
        "Assumes the child is eligible every year and contributions are made by December 31.",
      ],
      sources: uniq([rate.sourceUrl, yearMax.sourceUrl, lifetime.sourceUrl]),
    };
  });
}

/** Small supplier test: single calendar quarter OR last four consecutive quarters. */
export function hstRegistration(inputs: { quarter_1?: number; quarter_2?: number; quarter_3?: number; quarter_4?: number; revenue_12m?: number; rideshare?: number }): CalcResult {
  return wrap("hst_registration", () => {
    const t = num("hst_small_supplier_threshold");
    const quarters = [inputs.quarter_1, inputs.quarter_2, inputs.quarter_3, inputs.quarter_4].filter((q): q is number => typeof q === "number");
    const total = quarters.length ? quarters.reduce((a, b) => a + b, 0) : inputs.revenue_12m ?? 0;
    const singleQuarterOver = quarters.some((q) => q > t.value);
    const rideshare = !!inputs.rideshare;
    const mustRegister = rideshare || singleQuarterOver || total > t.value;
    const reason = rideshare ? "rideshare_or_taxi_must_register" : singleQuarterOver ? "over_threshold_in_one_quarter" : total > t.value ? "over_threshold_four_quarters" : "small_supplier";
    const assumptions = ["Counts worldwide taxable supplies (including zero-rated), before expenses."];
    if (!quarters.length) assumptions.push("Only a 12-month total was given, so the single-quarter test could not be checked.");
    return {
      result: { must_register: mustRegister, reason, revenue_counted: r2(total), threshold: t.value, room_left: r2(Math.max(0, t.value - total)) },
      assumptions,
      sources: [t.sourceUrl],
    };
  });
}

type Brackets = [number | null, number][];
function bracketTax(income: number, brackets: Brackets): number {
  let tax = 0;
  let lower = 0;
  for (const [upper, rate] of brackets) {
    const top = upper ?? Infinity;
    if (income > lower) tax += (Math.min(income, top) - lower) * (rate / 100);
    lower = top;
    if (income <= top) break;
  }
  return tax;
}
function brackets(key: string): { value: Brackets; sourceUrl: string } {
  const f = lookupFact(key);
  if (f.status !== "ok" || !Array.isArray(f.value)) throw new FactMissingError(key);
  return { value: f.value as Brackets, sourceUrl: f.sourceUrl };
}

/** Rough tax set-aside for self-employed income in Ontario. An estimate, not a return. */
export function gigTaxSetAside(inputs: { net_income?: number; other_income?: number }): CalcResult {
  return wrap("gig_tax_set_aside", () => {
    const net = Math.max(0, inputs.net_income ?? 0);
    const other = Math.max(0, inputs.other_income ?? 0);
    const be = num("cpp_basic_exemption"), ympe = num("cpp_ympe"), yampe = num("cpp_yampe");
    const rate1 = num("cpp_self_employed_rate"), rate2 = num("cpp2_self_employed_rate");
    const max1 = num("cpp_self_employed_max"), max2 = num("cpp2_self_employed_max");
    const cpp1 = Math.min(Math.max(0, Math.min(net, ympe.value) - be.value) * (rate1.value / 100), max1.value);
    const cpp2 = Math.min(Math.max(0, Math.min(net, yampe.value) - ympe.value) * (rate2.value / 100), max2.value);
    const cpp = cpp1 + cpp2;

    const fed = brackets("fed_tax_brackets"), on = brackets("on_tax_brackets");
    const fedBpa = num("fed_basic_personal_amount"), onBpa = num("on_basic_personal_amount");
    const fedLow = num("fed_lowest_rate");
    const taxable = Math.max(0, net + other - cpp / 2);
    const fedTax = Math.max(0, bracketTax(taxable, fed.value) - fedBpa.value * (fedLow.value / 100) - (cpp / 2) * (fedLow.value / 100));
    const onLow = on.value[0][1];
    const onTax = Math.max(0, bracketTax(taxable, on.value) - onBpa.value * (onLow / 100) - (cpp / 2) * (onLow / 100));
    const total = cpp + fedTax + onTax;
    return {
      result: {
        net_self_employment_income: r2(net),
        cpp_contributions: r2(cpp),
        federal_tax_estimate: r2(fedTax),
        ontario_tax_estimate: r2(onTax),
        total_set_aside: r2(total),
        per_month: r2(total / 12),
        percent_of_net: net > 0 ? r2((total / net) * 100) : 0,
      },
      assumptions: [
        "Estimate only. Ignores Ontario surtax, Ontario Health Premium, other credits and deductions, and CPP already paid through a job.",
        "Half of CPP is treated as a deduction and half as a credit at the lowest rate (simplified).",
        "Tax already withheld on other income is not subtracted.",
      ],
      sources: uniq([ympe.sourceUrl, fed.sourceUrl, on.sourceUrl]),
    };
  });
}

/** Ontario Energy and Property Tax Credit: the part we can compute exactly today. */
export function rentCreditEstimate(inputs: { annual_rent?: number }): CalcResult {
  return wrap("rent_credit_estimate", () => {
    const share = num("oeptc_rent_occupancy_share");
    const rent = Math.max(0, inputs.annual_rent ?? 0);
    const occupancy = rent * (share.value / 100);
    const max = lookupFact("oeptc_max_18_to_64");
    return {
      result: {
        annual_rent: r2(rent),
        occupancy_cost_counted: r2(occupancy),
        credit_estimate: null,
        status: max.status === "ok" ? "partial" : "credit_amount_not_verified",
      },
      assumptions: [
        "Only the occupancy cost (the share of rent treated as property tax) is computed. The credit amount depends on income and limits that are not yet verified in Lifeline's facts table; use the official estimator.",
      ],
      sources: uniq(["https://www.ontario.ca/page/ontario-trillium-benefit", share.sourceUrl]),
    };
  });
}

export const CALCULATORS = {
  cesg_grant: cesgGrant,
  hst_registration: hstRegistration,
  gig_tax_set_aside: gigTaxSetAside,
  rent_credit_estimate: rentCreditEstimate,
  tfsa_room: tfsaRoom,
  fhsa_room: fhsaRoom,
  resp_catch_up: respCatchUp,
} as const;

export type CalculatorName = keyof typeof CALCULATORS;

export function calculate(name: CalculatorName, inputs: Record<string, number>): CalcResult {
  const fn = CALCULATORS[name] as (i: Record<string, number>) => CalcResult;
  if (!fn) return { calculator: name, ok: false, result: {}, assumptions: [], sources: [], error: "unknown_calculator" };
  return fn(inputs);
}
