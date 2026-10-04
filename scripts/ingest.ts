import "./env";
import { ingestAll } from "../src/lib/rag/ingest";

const only = process.argv[2];
const report = await ingestAll({ only });
console.log(JSON.stringify({ ...report, failed: report.failed.length }, null, 2));
if (report.failed.length) {
  console.log("\nFailed:");
  for (const f of report.failed) console.log(`  ${f.url}  ${f.error}`);
}
if (report.changed.length) console.log(`\nChanged since last crawl (review facts): \n  ${report.changed.join("\n  ")}`);
