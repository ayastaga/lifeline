import * as cheerio from "cheerio";

// Clean an official page and split it by heading into ~500-token chunks.

export type Section = { heading: string | null; text: string };
export type Chunk = { ord: number; heading: string | null; text: string };

const DROP = "script, style, noscript, nav, header, footer, aside, form, .pagedetails, #wb-info, .gc-subway, .wb-share, [role=navigation], .breadcrumb";

export function extract(html: string): { title: string; sections: Section[] } {
  const $ = cheerio.load(html);
  const title = ($("h1").first().text() || $("title").text()).trim().replace(/\s+/g, " ");
  const root = $("main").length ? $("main").first() : $("body");
  root.find(DROP).remove();
  const sections: Section[] = [];
  let current: Section = { heading: null, text: "" };
  root.find("h1, h2, h3, h4, p, li, td, th, dt, dd, summary").each((_, el) => {
    const tag = (el as { tagName?: string }).tagName?.toLowerCase();
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (!text) return;
    if (tag && /^h[1-4]$/.test(tag)) {
      if (current.text.trim()) sections.push(current);
      current = { heading: text, text: "" };
    } else if (!$(el).parents("li, td").length || tag === "li" || tag === "td") {
      current.text += (tag === "li" ? "- " : "") + text + "\n";
    }
  });
  if (current.text.trim()) sections.push(current);
  return { title, sections };
}

/** ~4 characters per token is close enough for EN/FR source pages. */
export function chunkSections(sections: Section[], maxTokens = 500): Chunk[] {
  const maxChars = maxTokens * 4;
  const out: Chunk[] = [];
  for (const s of sections) {
    const paras = s.text.split("\n").filter(Boolean);
    let buf = "";
    for (const p of paras) {
      if ((buf + p).length > maxChars && buf) {
        out.push({ ord: out.length, heading: s.heading, text: buf.trim() });
        buf = "";
      }
      buf += p + "\n";
    }
    if (buf.trim()) out.push({ ord: out.length, heading: s.heading, text: buf.trim() });
  }
  return out;
}
