import seed from "./facts.seed.json";

// The facts table is versioned in git (this JSON) and mirrored to Postgres by
// `npm run seed:facts`. Runtime reads the JSON so every number in an answer is
// traceable to a reviewed commit. A fact with value null is "known unknown":
// lookups return status "unverified" and the model must point to the source.

export type FactValue = number | string | (number | null)[][];

export function factRow(key: string): FactRow | undefined {
  return FACTS.filter((f) => f.key === key).sort((a, b) => b.effective_year - a.effective_year)[0];
}

export type FactRow = {
  key: string;
  value: FactValue | null;
  unit: string;
  effective_year: number;
  source_url: string;
  last_checked: string | null;
  source_quality: "official" | "secondary" | "knowledge" | null;
  verified: boolean;
  note?: string;
  /** Exact span on the source page that supports the value (claim-level verification). */
  quote?: string;
  retrieved_at?: string;
  effective_from?: string;
  effective_until?: string;
  review_trigger?: "annual" | "tax_year_change" | "on_page_change";
};

export type FactLookup =
  | { status: "ok"; key: string; value: FactValue; unit: string; effectiveYear: number; sourceUrl: string; lastChecked: string | null; verified: boolean; sourceQuality: FactRow["source_quality"]; quote?: string; retrievedAt?: string }
  | { status: "unverified"; key: string; sourceUrl: string; note?: string }
  | { status: "not_found"; key: string; knownKeys: string[] };

const FACTS = seed as FactRow[];

export function allFacts(): FactRow[] {
  return FACTS;
}

export function lookupFact(key: string, year?: number): FactLookup {
  const rows = FACTS.filter((f) => f.key === key).sort((a, b) => b.effective_year - a.effective_year);
  if (rows.length === 0) return { status: "not_found", key, knownKeys: FACTS.map((f) => f.key) };
  const row = (year ? rows.find((r) => r.effective_year <= year) : rows[0]) ?? rows[0];
  if (row.value === null || row.value === undefined) {
    return { status: "unverified", key, sourceUrl: row.source_url, note: row.note };
  }
  return {
    status: "ok",
    key: row.key,
    value: row.value,
    unit: row.unit,
    effectiveYear: row.effective_year,
    sourceUrl: row.source_url,
    lastChecked: row.last_checked,
    verified: row.verified,
    sourceQuality: row.source_quality,
    quote: row.quote,
    retrievedAt: row.retrieved_at,
  };
}

/** Numeric fact or throw. Calculators use this so a missing number fails loudly. */
export function num(key: string): { value: number; sourceUrl: string } {
  const f = lookupFact(key);
  if (f.status !== "ok" || typeof f.value !== "number") throw new FactMissingError(key);
  return { value: f.value, sourceUrl: f.sourceUrl };
}

export class FactMissingError extends Error {
  constructor(public key: string) {
    super(`fact_missing:${key}`);
  }
}
