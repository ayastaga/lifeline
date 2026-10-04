import { describe, expect, it } from "vitest";
import { fhsaRoom, respCatchUp, tfsaRoom } from "@/lib/calculators/accounts";

// Expected values are CRA's own worked examples where they exist.
describe("tfsa_room", () => {
  it("CRA example: 40-year-old, resident since 2024 -> $7,000 in 2024, $21,000 by 2026", () => {
    expect(tfsaRoom({ birth_year: 1984, residency_start_year: 2024, current_year: 2024 }).result.room_accumulated).toBe(7000);
    expect(tfsaRoom({ birth_year: 1984, residency_start_year: 2024, current_year: 2026 }).result.room_accumulated).toBe(21000);
  });
  it("eligible every year since 2009 -> $109,000 in 2026", () => {
    expect(tfsaRoom({ birth_year: 1980, always_resident: 1, current_year: 2026 }).result.room_accumulated).toBe(109000);
  });
  it("CRA example: turned 18 in December 2024 -> $14,000 in 2025", () => {
    expect(tfsaRoom({ birth_year: 2006, always_resident: 1, current_year: 2025 }).result.room_accumulated).toBe(14000);
  });
  it("subtracts contributions and flags over-contribution (CRA David example)", () => {
    const r = tfsaRoom({ birth_year: 1984, residency_start_year: 2024, contributed_total: 95000, current_year: 2024 });
    expect(r.result).toMatchObject({ available_room: -88000, over_contributed: true });
  });
  it("asks for residency instead of guessing", () => {
    expect(tfsaRoom({ birth_year: 1990, current_year: 2026 }).error).toBe("needs_input:residencyStartYear");
  });
  it("refuses a year whose dollar limit isn't in the facts table yet", () => {
    expect(tfsaRoom({ birth_year: 1990, always_resident: 1, current_year: 2027 }).error).toMatch(/^missing_fact:tfsa_dollar_limits@2027/);
  });
});

describe("fhsa_room", () => {
  it("not opened: room starts only when opened", () => {
    expect(fhsaRoom({ has_fhsa: 0, current_year: 2026 }).result).toMatchObject({ room_if_opened_this_year: 8000, lifetime_limit: 40000 });
  });
  it("carry-forward is capped", () => {
    expect(fhsaRoom({ has_fhsa: 1, opened_year: 2024, contributed_total: 10000, current_year: 2026 }).result).toMatchObject({ carried_forward: 6000, available_room: 14000 });
    expect(fhsaRoom({ has_fhsa: 1, opened_year: 2023, contributed_total: 0, current_year: 2026 }).result).toMatchObject({ carried_forward: 8000, available_room: 16000 });
  });
  it("lifetime limit binds", () => {
    expect(fhsaRoom({ has_fhsa: 1, opened_year: 2023, contributed_total: 36000, current_year: 2026 }).result.available_room).toBe(4000);
  });
});

describe("resp_catch_up", () => {
  it("newcomer child: room only from the year of residency", () => {
    const r = respCatchUp({ child_birth_year: 2012, child_residency_start_year: 2025, current_year: 2026 });
    expect(r.result).toMatchObject({ grant_room_accrued: 1000, max_still_recoverable: 2500, contribute_by_end_of_year_for_16_17: 2027 });
  });
  it("room above the lifetime cap is not counted as expiring", () => {
    const r = respCatchUp({ child_birth_year: 2023, child_residency_start_year: 2024, current_year: 2026 });
    expect(r.result).toMatchObject({ max_still_recoverable: 7200, room_that_would_expire_unclaimed: 0 });
  });
  it("late start: catch-up limited to $1,000 a year, the rest expires", () => {
    // Born 2014, resident since birth, nothing claimed: 13 years of room by 2026; 6 years left (2026-2031) at $1,000 max = $6,000;
    // claimable room is capped at the $7,200 lifetime limit, so $1,200 expires.
    const r = respCatchUp({ child_birth_year: 2014, grants_received: 0, current_year: 2026 });
    expect(r.result).toMatchObject({ grant_room_accrued: 6500, max_still_recoverable: 6000, room_that_would_expire_unclaimed: 1200, at_risk_16_17_rule: false, contribute_by_end_of_year_for_16_17: 2029 });
  });
  it("after the year the child turns 17, no grants", () => {
    expect(respCatchUp({ child_birth_year: 2008, current_year: 2026 }).result.grants_still_available).toBe(false);
  });
});
