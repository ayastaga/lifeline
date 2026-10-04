import { createHash } from "node:crypto";
import sources from "../../../scripts/sources.json";
import { embed } from "../ai/provider";
import { adminClient } from "../supabase/server";
import { chunkSections, extract } from "./chunk";

// fetch -> clean -> chunk by heading -> embed -> store. Allowlist only,
// robots.txt respected, rate limited, unchanged pages skipped by content hash.

type Source = { url: string; program_id: string | null; language: string };
type Report = { fetched: number; unchanged: number; failed: { url: string; error: string }[]; chunks: number; changed: string[] };

const UA = process.env.INGEST_USER_AGENT ?? "lifeline-dev";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const robotsCache = new Map<string, string[]>();

async function disallowed(url: URL): Promise<boolean> {
  if (!sources.crawl.respect_robots) return false;
  let rules = robotsCache.get(url.host);
  if (!rules) {
    rules = [];
    try {
      const txt = await (await fetch(`${url.protocol}//${url.host}/robots.txt`, { headers: { "user-agent": UA } })).text();
      let applies = false;
      for (const line of txt.split("\n")) {
        const [k, ...rest] = line.split(":");
        const v = rest.join(":").trim();
        if (/^user-agent$/i.test(k.trim())) applies = v === "*";
        else if (applies && /^disallow$/i.test(k.trim()) && v) rules.push(v);
      }
    } catch { /* no robots.txt: allowed */ }
    robotsCache.set(url.host, rules);
  }
  return rules.some((r) => url.pathname.startsWith(r));
}

export async function ingestAll(opts: { log?: (s: string) => void; only?: string } = {}): Promise<Report> {
  const log = opts.log ?? console.log;
  const db = adminClient();
  const report: Report = { fetched: 0, unchanged: 0, failed: [], chunks: 0, changed: [] };
  const list = (sources.sources as Source[]).filter((s) => !opts.only || s.url.includes(opts.only));

  for (const src of list) {
    const url = new URL(src.url);
    if (!sources.allowlist_domains.includes(url.host)) { report.failed.push({ url: src.url, error: "not_allowlisted" }); continue; }
    if (await disallowed(url)) { report.failed.push({ url: src.url, error: "robots_disallow" }); continue; }
    try {
      const res = await fetch(src.url, { headers: { "user-agent": UA, "accept-language": src.language } });
      if (!res.ok) throw new Error(`http_${res.status}`);
      const html = await res.text();
      const { title, sections } = extract(html);
      const text = sections.map((s) => `${s.heading ?? ""}\n${s.text}`).join("\n");
      const hash = createHash("sha256").update(text).digest("hex");

      const { data: existing } = await db.from("sources").select("id, content_hash").eq("url", src.url).maybeSingle();
      if (existing?.content_hash === hash) {
        report.unchanged++;
        await db.from("sources").update({ last_crawled: new Date().toISOString() }).eq("id", existing.id);
        log(`= ${src.url}`);
        continue;
      }
      const { data: sourceRow, error: sErr } = await db.from("sources").upsert(
        { url: src.url, domain: url.host.replace(/^www\./, ""), program_id: src.program_id, language: src.language, last_crawled: new Date().toISOString(), content_hash: hash },
        { onConflict: "url" },
      ).select("id").single();
      if (sErr) throw new Error(sErr.message);
      await db.from("documents").delete().eq("source_id", sourceRow.id);
      const { data: doc, error: dErr } = await db.from("documents").insert({ source_id: sourceRow.id, title, text }).select("id").single();
      if (dErr) throw new Error(dErr.message);

      const chunks = chunkSections(sections);
      for (let i = 0; i < chunks.length; i += 32) {
        const batch = chunks.slice(i, i + 32);
        const vectors = await embed(batch.map((c) => `${title}\n${c.heading ?? ""}\n${c.text}`));
        const { error } = await db.from("chunks").insert(
          batch.map((c, j) => ({ document_id: doc.id, ord: c.ord, heading: c.heading, text: c.text, embedding: vectors[j] as unknown as string })),
        );
        if (error) throw new Error(error.message);
      }
      report.fetched++;
      report.chunks += chunks.length;
      if (existing) report.changed.push(src.url);
      log(`+ ${src.url} (${chunks.length} chunks)`);
    } catch (e) {
      report.failed.push({ url: src.url, error: (e as Error).message });
      log(`! ${src.url}: ${(e as Error).message}`);
    }
    await sleep(sources.crawl.rate_limit_ms);
  }
  return report;
}
