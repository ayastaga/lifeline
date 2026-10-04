import "./env";
import { PROGRAMS } from "../src/lib/rules/programs";
import { adminClient } from "../src/lib/supabase/server";

const { error } = await adminClient().from("programs").upsert(
  PROGRAMS.map((p) => ({
    id: p.id, name: p.name, level: p.level, jurisdiction: p.jurisdiction, personas: p.personas,
    apply_url: p.apply_url, rules: p, verify: p.verify, kind: p.kind, updated_at: new Date().toISOString(),
  })),
  { onConflict: "id" },
);
if (error) { console.error(error.message); process.exit(1); }
console.log(`seeded ${PROGRAMS.length} programs`);
