import { describe, expect, it } from "vitest";
import { cesgGrant, gigTaxSetAside, hstRegistration, rentCreditEstimate } from "@/lib/calculators";

describe("cesg_grant", () => {
  it("$100/month -> 20% of $1,200 = $240, under the annual cap", () => {
    const r = cesgGrant({ monthly_contribution: 100 });
    expect(r.ok).toBe(true);
    expect(r.result).toMatchObject({ annual_contribution: 1200, grant_per_year: 240, total_grant: 240 });
    expect(r.sources[0]).toContain("canada.ca");
  });
  it("caps at the annual max, and at the lifetime max over years", () => {
    expect(cesgGrant({ annual_contribution: 5000 }).result.grant_per_year).toBe(500);
    expect(cesgGrant({ annual_contribution: 5000, has_unused_room: 1 }).result.grant_per_year).toBe(1000);
    const long = cesgGrant({ annual_contribution: 2500, years: 18 });
    expect(long.result).toMatchObject({ total_grant: 7200, hit_lifetime_cap: true });
  });
});

describe("hst_registration", () => {
  it("over threshold across four quarters", () => {
    const r = hstRegistration({ quarter_1: 9000, quarter_2: 8000, quarter_3: 7000, quarter_4: 8000 });
    expect(r.result).toMatchObject({ must_register: true, reason: "over_threshold_four_quarters", revenue_counted: 32000 });
  });
  it("single quarter over threshold", () => {
    expect(hstRegistration({ quarter_1: 31000 }).result.reason).toBe("over_threshold_in_one_quarter");
  });
  it("small supplier, and ride-share override", () => {
    expect(hstRegistration({ revenue_12m: 18000 }).result).toMatchObject({ must_register: false, room_left: 12000 });
    expect(hstRegistration({ revenue_12m: 5000, rideshare: 1 }).result.must_register).toBe(true);
  });
});

describe("gig_tax_set_aside", () => {
  it("CPP on $40k net self-employment = (40,000 - 3,500) x 11.9%", () => {
    const r = gigTaxSetAside({ net_income: 40000 });
    expect(r.ok).toBe(true);
    expect(r.result.cpp_contributions).toBeCloseTo(4343.5, 2);
    expect(Number(r.result.total_set_aside)).toBeGreaterThan(Number(r.result.cpp_contributions));
    expect(Number(r.result.per_month)).toBeCloseTo(Number(r.result.total_set_aside) / 12, 1);
  });
  it("CPP is capped, CPP2 applies between YMPE and YAMPE", () => {
    const r = gigTaxSetAside({ net_income: 120000 });
    expect(r.result.cpp_contributions).toBeCloseTo(8460.9 + 832, 2);
  });
  it("zero income -> zero", () => {
    expect(gigTaxSetAside({ net_income: 0 }).result.total_set_aside).toBe(0);
  });
});

describe("rent_credit_estimate", () => {
  it("computes occupancy cost, refuses to invent the credit amount", () => {
    const r = rentCreditEstimate({ annual_rent: 18000 });
    expect(r.result).toMatchObject({ occupancy_cost_counted: 3600, credit_estimate: null, status: "credit_amount_not_verified" });
  });
});
