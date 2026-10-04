import { FactMissingError, lookupFact, num } from "../facts";
import type { CalcResult } from "./index";

// Registered-account calculators (milestone 1). Arithmetic on public rules only:
// they report room and grants, never what to do with money.

const uniq = (a: string[]) => [...new Set(a)];
const thisYear = () => new Date().getFullYear();

function wrap(name: string, fn: () => Omit<CalcResult, "calculator" | "ok">): CalcResult {
  try {
    return { calculator: name, ok: true, ...fn() };
  } catch (e) {
    if (e instanceof FactMissingError) {
      const f = lookupFact(e.key.split("@")[0]);
      return { calculator: name, ok: false, result: {}, assumptions: [], sources: "sourceUrl" in f ? [f.sourceUrl] : [], error: `missing_fact:${e.key}` };
    }
    if (e instanceof NeedsInput) return { calculator: name, ok: false, result: { needs: e.keys.join(",") }, assumptions: [], sources: [], error: `needs_input:${e.keys.join(",")}` };
    return { calculator: name, ok: false, result: {}, assumptions: [], sources: [], error: (e as Error).message };
  }
}

export class NeedsInput extends Error {
  constructor(public keys: string[]) {
    super(`needs_input:${keys.join(",")}`);
  }
}

function tfsaLimits(): { byYear: Map<number, number>; sourceUrl: string } {
  const f = lookupFact("tfsa_dollar_limits");
  if (f.status !== "ok" || !Array.isArray(f.value)) throw new FactMissingError("tfsa_dollar_limits");
  return { byYear: new Map((f.value as number[][]).map(([y, l]) => [y, l])), sourceUrl: f.sourceUrl };
}

function birthYearOf(inputs: { birth_year?: number; age?: number }, current: number, assumptions: string[]): number {
  if (inputs.birth_year) return inputs.birth_year;
  if (inputs.age !== undefined) {
    assumptions.push("Birth year estimated from age; it may be off by one year.");
    return current - inputs.age;
  }
  throw new NeedsInput(["birthYear"]);
}

/** TFSA room accumulated since you became eligible (18+ and a resident), minus what you've put in. */
export function tfsaRoom(inputs: {
  birth_year?: number; age?: number; residency_start_year?: number; always_resident?: number;
  contributed_total?: number; withdrawn_before_this_year?: number; current_year?: number;
}): CalcResult {
  return wrap("tfsa_room", () => {
    const current = inputs.current_year ?? thisYear();
    const assumptions: string[] = [];
    const limits = tfsaLimits();
    const minAge = num("tfsa_min_age");
    const born = birthYearOf(inputs, current, assumptions);
    if (!inputs.always_resident && inputs.residency_start_year === undefined) throw new NeedsInput(["residencyStartYear"]);
    const first = Math.max(2009, born + minAge.value, inputs.always_resident ? 0 : inputs.residency_start_year!);
    if (!limits.byYear.has(current)) throw new FactMissingError(`tfsa_dollar_limits@${current}`);
    let accumulated = 0;
    const years: number[] = [];
    for (let y = first; y <= current; y++) {
      const l = limits.byYear.get(y);
      if (l === undefined) throw new FactMissingError(`tfsa_dollar_limits@${y}`);
      accumulated += l;
      years.push(y);
    }
    if (inputs.always_resident) assumptions.push("Assumes you were a resident of Canada every year since you turned 18 (or 2009).");
    const known = inputs.contributed_total !== undefined;
    if (!known) assumptions.push("Your past contributions are unknown, so this is room before contributions. CRA My Account shows the exact figure.");
    if (inputs.withdrawn_before_this_year === undefined && known) assumptions.push("Assumes no withdrawals in earlier years (withdrawals add room back the next January).");
    const available = known ? accumulated - inputs.contributed_total! + (inputs.withdrawn_before_this_year ?? 0) : null;
    return {
      result: {
        first_year_with_room: years.length ? first : null,
        years_counted: years.length,
        room_accumulated: accumulated,
        available_room: available,
        over_contributed: available !== null && available < 0,
        this_year_limit: limits.byYear.get(current)!,
      },
      assumptions,
      sources: uniq([limits.sourceUrl, minAge.sourceUrl]),
    };
  });
}

/** FHSA participation room: starts when you open one; unused room carries forward up to a cap. */
export function fhsaRoom(inputs: { has_fhsa?: number; opened_year?: number; contributed_total?: number; current_year?: number }): CalcResult {
  return wrap("fhsa_room", (): Omit<CalcResult, "calculator" | "ok"> => {
    const current = inputs.current_year ?? thisYear();
    const annual = num("fhsa_annual_limit"), lifetime = num("fhsa_lifetime_limit"), cf = num("fhsa_carry_forward_max");
    const assumptions: string[] = [];
    const sources = uniq([annual.sourceUrl]);
    if (!inputs.has_fhsa) {
      return {
        result: { has_fhsa: false, room_if_opened_this_year: annual.value, lifetime_limit: lifetime.value, carry_forward_cap: cf.value },
        assumptions: ["Room only starts accumulating in the year the first FHSA is opened; years before that add nothing."],
        sources,
      };
    }
    if (inputs.opened_year === undefined) throw new NeedsInput(["fhsaOpenedYear"]);
    if (inputs.contributed_total === undefined) {
      return {
        result: { has_fhsa: true, opened_year: inputs.opened_year, available_room: null, lifetime_limit: lifetime.value },
        assumptions: ["Your contributions are unknown, so room can't be worked out. Your FHSA statement or CRA My Account shows it."],
        sources,
      };
    }
    const priorYears = Math.max(0, current - inputs.opened_year);
    const unusedPrior = Math.max(0, annual.value * priorYears - inputs.contributed_total);
    const carry = Math.min(cf.value, unusedPrior);
    const lifetimeLeft = Math.max(0, lifetime.value - inputs.contributed_total);
    const room = Math.max(0, Math.min(annual.value + carry, lifetimeLeft));
    assumptions.push("Assumes all past contributions were made before this year and none were RRSP transfers or withdrawals.");
    return {
      result: { has_fhsa: true, opened_year: inputs.opened_year, carried_forward: carry, available_room: room, lifetime_left: lifetimeLeft },
      assumptions,
      sources,
    };
  });
}

/** RESP: grant room your child has built up, how much can still be claimed, and what would expire. */
export function respCatchUp(inputs: {
  child_birth_year?: number; child_age?: number; child_residency_start_year?: number; grants_received?: number; current_year?: number;
}): CalcResult {
  return wrap("resp_catch_up", (): Omit<CalcResult, "calculator" | "ok"> => {
    const current = inputs.current_year ?? thisYear();
    const assumptions: string[] = [];
    const born = birthYearOf({ birth_year: inputs.child_birth_year, age: inputs.child_age }, current, assumptions);
    const roomPerYear = num("cesg_annual_room"), lastAge = num("cesg_last_age"), cutoff = num("cesg_age_16_17_cutoff_age");
    const yearMax = num("cesg_annual_max_with_carry_forward"), lifetime = num("cesg_lifetime_max"), rate = num("cesg_match_rate");
    const sources = uniq([roomPerYear.sourceUrl, yearMax.sourceUrl, lifetime.sourceUrl]);
    const lastYear = born + lastAge.value;
    if (current > lastYear) {
      return { result: { grants_still_available: false, last_year_for_grants: lastYear }, assumptions, sources };
    }
    const firstRoomYear = Math.max(2007, born, inputs.child_residency_start_year ?? born);
    if (inputs.child_residency_start_year) assumptions.push("Grant room only builds for years the child was a resident of Canada.");
    const accrued = firstRoomYear <= current ? roomPerYear.value * (current - firstRoomYear + 1) : 0;
    if (inputs.grants_received === undefined) assumptions.push("Assumes no grants have been paid yet. Your RESP statement shows the actual amount.");
    const received = inputs.grants_received ?? 0;
    let room = Math.max(0, accrued - received);
    const unusedNow = room;
    const lifetimeLeftAtStart = Math.max(0, lifetime.value - received);
    let lifetimeLeft = lifetimeLeftAtStart;
    let recoverable = 0;
    let futureAccrual = 0;
    let thisYearMax = 0;
    for (let y = current; y <= lastYear; y++) {
      if (y > current) { room += roomPerYear.value; futureAccrual += roomPerYear.value; }
      const g = Math.min(yearMax.value, room, lifetimeLeft);
      if (y === current) thisYearMax = g;
      room -= g; lifetimeLeft -= g; recoverable += g;
    }
    // Room above the lifetime cap was never claimable, so it doesn't count as expiring.
    const claimableRoom = Math.min(unusedNow + futureAccrual, lifetimeLeftAtStart);
    const expires = Math.max(0, claimableRoom - recoverable);
    const age = current - born;
    return {
      result: {
        child_age_this_year: age,
        grant_room_accrued: accrued,
        unused_grant_room_now: unusedNow,
        max_grant_this_year: thisYearMax,
        contribution_to_get_max_this_year: Math.round(thisYearMax / (rate.value / 100)),
        max_still_recoverable: recoverable,
        room_that_would_expire_unclaimed: expires,
        last_year_for_grants: lastYear,
        contribute_by_end_of_year_for_16_17: age <= cutoff.value ? born + cutoff.value : null,
        at_risk_16_17_rule: age > cutoff.value && received === 0,
      },
      assumptions,
      sources,
    };
  });
}
