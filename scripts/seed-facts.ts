import "./env";
import { allFacts } from "../src/lib/facts";
import { adminClient } from "../src/lib/supabase/server";

// Mirrors src/lib/facts/facts.seed.json into Postgres. Null values are
// "known unknowns" and are skipped (facts.value is NOT NULL).
const rows = allFacts().filter((f) => f.value !== null);
const skipped = allFacts().filter((f) => f.value === null).map((f) => f.key);

const { error } = await adminClient().from("facts").upsert(
  rows.map((f) => ({
    key: f.key, value: f.value, unit: f.unit, effective_year: f.effective_year, source_url: f.source_url,
    last_checked: f.last_checked, note: f.note ?? null, source_quality: f.source_quality, verified: f.verified,
  })),
  { onConflict: "key,effective_year" },
);
if (error) { console.error(error.message); process.exit(1); }
console.log(`seeded ${rows.length} facts; skipped unverified nulls: ${skipped.join(", ") || "none"}`);
