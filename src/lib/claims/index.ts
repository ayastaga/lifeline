import { factRow, lookupFact } from "../facts";
import type { CalcResult } from "../calculators";

// Answers are assembled from claims, not free text. A claim says one thing,
// carries the sources that support it, the user facts and rules it depends on,
// and a status the person can see. The model renders claims into language; it
// never creates them.

export type ClaimStatus = "verified" | "calculated" | "needs_fact" | "unverified" | "conflict" | "may_have_changed";
export type ClaimKind = "eligibility" | "fact" | "calculation" | "assumption" | "action" | "unknown";

export type SourceRef = {
  url: string;
  tier: 1 | 2 | 3;
  quote?: string;
  retrievedAt?: string;
  factKey?: string;
};

export type Claim = {
  id: string;
  kind: ClaimKind;
  /** Machine id of what is claimed (fact key, reason code, calculator name). Rendered via i18n or by the model. */
  key: string;
  params: Record<string, string | number | boolean | null>;
  sources: SourceRef[];
  appliesTo: { taxYear?: number; jurisdiction: "CA" | "ON" };
  dependsOn: { userFacts: string[]; facts: string[]; calculator?: string };
  status: ClaimStatus;
  /** A person has reviewed the underlying rule/fact (the verify gate). Separate from machine verification. */
  reviewed: boolean;
};

const TIER1 = /(^|\.)(canada\.ca|ontario\.ca|gc\.ca|osc\.ca)$/;
export function tierOf(url: string): 1 | 2 | 3 {
  try {
    return TIER1.test(new URL(url).hostname) ? 1 : 2;
  } catch {
    return 3;
  }
}

/** Machine status of one fact today. */
export function factStatus(key: string, currentYear: number): ClaimStatus {
  const row = factRow(key);
  if (!row || row.value === null) return "unverified";
  if (row.effective_until && new Date(row.effective_until).getUTCFullYear() < currentYear) return "may_have_changed";
  if ((row.review_trigger === "annual" || row.review_trigger === "tax_year_change") && row.effective_year < currentYear) return "may_have_changed";
  if (row.source_quality !== "official") return "unverified";
  return "verified";
}

export function factClaim(key: string, currentYear: number): Claim {
  const row = factRow(key);
  const f = lookupFact(key);
  const value = f.status === "ok" ? (Array.isArray(f.value) ? JSON.stringify(f.value) : f.value) : null;
  return {
    id: `fact:${key}`,
    kind: "fact",
    key,
    params: { value, unit: row?.unit ?? null },
    sources: row ? [{ url: row.source_url, tier: tierOf(row.source_url), quote: row.quote, retrievedAt: row.retrieved_at ?? row.last_checked ?? undefined, factKey: key }] : [],
    appliesTo: { taxYear: row?.effective_year, jurisdiction: row?.source_url.includes("ontario.ca") ? "ON" : "CA" },
    dependsOn: { userFacts: [], facts: [key] },
    status: factStatus(key, currentYear),
    reviewed: !!row?.verified,
  };
}

const RANK: Record<ClaimStatus, number> = { verified: 0, calculated: 1, may_have_changed: 2, unverified: 3, needs_fact: 4, conflict: 5 };
/** The weakest status wins: a calculation is only as good as its least-certain input. */
export function weakest(statuses: ClaimStatus[]): ClaimStatus {
  return statuses.reduce<ClaimStatus>((w, s) => (RANK[s] > RANK[w] ? s : w), "verified");
}

export function calcClaim(id: string, calc: CalcResult, deps: { userFacts: string[]; facts: string[] }, currentYear: number): Claim {
  let status: ClaimStatus;
  if (!calc.ok) status = calc.error?.startsWith("needs_input") ? "needs_fact" : calc.error?.startsWith("missing_fact") ? "may_have_changed" : "unverified";
  else {
    const factStatuses = deps.facts.map((k) => factStatus(k, currentYear));
    const w = weakest(factStatuses);
    status = w === "verified" ? "calculated" : w;
  }
  return {
    id,
    kind: "calculation",
    key: calc.calculator,
    params: calc.result,
    sources: calc.sources.map((url) => ({ url, tier: tierOf(url) })),
    appliesTo: { taxYear: currentYear, jurisdiction: "CA" },
    dependsOn: { ...deps, calculator: calc.calculator },
    status,
    reviewed: deps.facts.every((k) => factRow(k)?.verified),
  };
}

/** Two claims about the same fact key with different values are a conflict; neither is used. */
export function detectConflicts(claims: Claim[]): Claim[] {
  const byKey = new Map<string, Claim[]>();
  for (const c of claims.filter((c) => c.kind === "fact")) byKey.set(c.key, [...(byKey.get(c.key) ?? []), c]);
  const conflicted = new Set<string>();
  for (const [key, group] of byKey) {
    const values = new Set(group.map((c) => JSON.stringify(c.params.value)));
    if (values.size > 1) conflicted.add(key);
  }
  return claims.map((c) => (c.kind === "fact" && conflicted.has(c.key) ? { ...c, status: "conflict" as const } : c));
}
