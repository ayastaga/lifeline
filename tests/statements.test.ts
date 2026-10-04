import { describe, expect, it } from "vitest";
import { classify, parseStatement, situationHints } from "@/lib/statements";

const CSV = `Date,Description,Amount
2026-07-01,E-TRANSFER RENT LANDLORD,-1650.00
2026-08-01,E-TRANSFER RENT LANDLORD,-1650.00
2026-09-01,E-TRANSFER RENT LANDLORD,-1650.00
2026-07-08,UBER CANADA PAYOUT,412.20
2026-07-22,UBER CANADA PAYOUT,388.00
2026-08-05,DOORDASH,250.00
2026-07-20,CANADA CHILD BENEFIT CCB,679.75
2026-07-15,NO FRILLS #3412,-87.12
2026-08-12,BRIGHT KIDS DAYCARE,-900.00`;

describe("statement parsing", () => {
  it("parses, classifies and derives hints only", () => {
    const { rows } = parseStatement(CSV);
    expect(rows).toHaveLength(9);
    expect(rows.find((r) => r.description.startsWith("UBER"))?.category).toBe("gig_income");
    const { hints, candidates } = situationHints(rows);
    expect(hints.map((h) => h.code)).toEqual(expect.arrayContaining(["rent_payments_detected", "gig_income_detected", "childcare_payments_detected", "government_benefits_detected"]));
    expect(candidates.find((c) => c.key === "annualRent")?.value).toBe(19800);
    expect(candidates.every((c) => c.source === "statement")).toBe(true);
  });
  it("debit/credit column exports", () => {
    const { rows } = parseStatement(`Transaction Date,Details,Debit,Credit\n07/01/2026,RENT,1650,\n07/08/2026,PAYROLL ACME,,2100`);
    expect(rows.map((r) => [r.postedOn, r.amount, r.category])).toEqual([["2026-07-01", -1650, "rent"], ["2026-07-08", 2100, "payroll"]]);
  });
  it("direction matters: a refund from Uber Eats isn't gig income if negative", () => {
    expect(classify("UBER CANADA", -25)).toBe("other");
  });
});
