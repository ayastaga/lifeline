import { allFacts } from "../src/lib/facts";
import { PROGRAMS } from "../src/lib/rules/programs";

// The verify gate. Prints what still needs a human check; exits non-zero in
// production mode (LIFELINE_ENFORCE_VERIFY=1) if anything is unverified.
const programs = PROGRAMS.filter((p) => p.verify);
const facts = allFacts().filter((f) => !f.verified);
console.log(`Programs awaiting verification: ${programs.length}/${PROGRAMS.length}`);
for (const p of programs) console.log(`  - ${p.id}${p.verify_note ? `  (${p.verify_note})` : ""}`);
console.log(`Facts awaiting verification: ${facts.length}`);
for (const f of facts) console.log(`  - ${f.key} [${f.source_quality ?? "missing"}] ${f.value === null ? "VALUE MISSING" : ""}`);
if (process.env.LIFELINE_ENFORCE_VERIFY === "1" && (programs.length || facts.length)) {
  console.error("\nverify gate failed: unverified programs or facts in a production build");
  process.exit(1);
}
