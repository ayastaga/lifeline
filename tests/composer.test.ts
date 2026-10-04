import { describe, expect, it } from "vitest";
import { compose, extractNumbers, splitSentences, REFUSAL_MARKER } from "@/lib/ai/composer";

describe("number extraction", () => {
  it("handles separators, decimals, k, and non-Latin digits", () => {
    expect(extractNumbers("$8,157 and 146.66 and 20%")).toEqual([8157, 146.66, 20]);
    expect(extractNumbers("8 157 $ ou 146,66 $")).toEqual([8157, 146.66]);
    expect(extractNumbers("about $30k")).toEqual([30000]);
    expect(extractNumbers("٢٤٠ ڈالر")).toEqual([240]); // Arabic-Indic
    expect(extractNumbers("₹ ੨੪੦")).toEqual([240]); // Gurmukhi
  });
  it("does not split sentences inside decimals", () => {
    expect(splitSentences("It is 146.66 a month. Next.")).toHaveLength(2);
    expect(splitSentences("每年240元。很好。")).toHaveLength(2);
  });
});

const calc = { tool: "calculate", input: {}, output: { ok: true, result: { grant_per_year: 240, annual_contribution: 1200 }, sources: ["https://www.canada.ca/en/services/benefits/education/education-savings/savings-grant.html"] } };

describe("claim check", () => {
  it("keeps sentences whose numbers came from tools or the user", () => {
    const c = compose({ draft: "If you put in $100 a month, the government adds $240 a year.", toolCalls: [calc], userText: "If I put $100 a month", profile: {}, language: "en" });
    expect(c.replacedSentences).toEqual([]);
    expect(c.citations[0].url).toContain("savings-grant");
  });
  it("replaces a sentence with an unchecked number (model arithmetic)", () => {
    const c = compose({ draft: "The grant is $240 a year. Over 18 years that is $4,320! Open an RESP soon.", toolCalls: [calc], userText: "", profile: {}, language: "en" });
    expect(c.replacedSentences).toHaveLength(1);
    expect(c.text).toContain("official page");
    expect(c.text).toContain("$240");
    expect(c.text).toContain("Open an RESP soon.");
  });
  it("uses the reply language for the pointer, and Shahmukhi for pa/Arab", () => {
    expect(compose({ draft: "ਹਰ ਸਾਲ 999 ਡਾਲਰ।", toolCalls: [], userText: "", profile: {}, language: "pa", script: "Guru" }).text).toContain("ਸਰਕਾਰੀ ਪੰਨਾ");
    expect(compose({ draft: "ہر سال 999 ڈالر۔", toolCalls: [], userText: "", profile: {}, language: "pa", script: "Arab" }).text).toContain("سرکاری");
  });
  it("ignores markdown list numbering", () => {
    const c = compose({ draft: "1. Open an RESP.\n2. Apply for the grant.", toolCalls: [], userText: "", profile: {}, language: "en" });
    expect(c.replacedSentences).toEqual([]);
  });
  it("strips links the model wrote; only code attaches citations", () => {
    const c = compose({ draft: "See [this page](https://evil.example.com/x) or https://www.canada.ca/foo.", toolCalls: [], userText: "", profile: {}, language: "en" });
    expect(c.text).not.toContain("http");
    expect(c.citations).toEqual([]);
  });
  it("refusal marker -> refused, no citations", () => {
    const c = compose({ draft: `${REFUSAL_MARKER} I can't give stock advice.`, toolCalls: [calc], userText: "", profile: {}, language: "en" });
    expect(c).toMatchObject({ refused: true, citations: [] });
    expect(c.text).not.toContain(REFUSAL_MARKER);
  });
  it("citations: only eligible/likely programs and allowlisted domains", () => {
    const elig = { tool: "check_eligibility", input: {}, output: { results: [
      { status: "eligible", applyUrl: "https://www.canada.ca/a", name: "A" },
      { status: "not_eligible", applyUrl: "https://www.canada.ca/b", name: "B" },
      { status: "likely", applyUrl: "https://www.ontario.ca/c", name: "C" },
    ] } };
    expect(compose({ draft: "Ok.", toolCalls: [elig], userText: "", profile: {}, language: "en" }).citations.map((c) => c.url)).toEqual(["https://www.canada.ca/a", "https://www.ontario.ca/c"]);
  });
});
