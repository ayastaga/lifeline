import { asciiDigits, type Lang } from "../i18n/detect";

// Post-processes the model's draft:
// 1. Refusal marker -> scope note, no citations.
// 2. Claim check: every number in a sentence must appear in a tool result or
//    the user's own words. Otherwise the sentence is replaced by a pointer to
//    the official page. The model never gets to do arithmetic in public.
// 3. Citations are attached by code from tool outputs (allowlisted domains).

export const REFUSAL_MARKER = "[[OUT_OF_SCOPE]]";
const ALLOWED_DOMAINS = ["canada.ca", "www.canada.ca", "ontario.ca", "www.ontario.ca"];
const MAX_CITATIONS = 6;

export type Citation = { url: string; title: string | null };
export type ToolCallRecord = { tool: string; input: unknown; output: unknown };
export type Composed = { text: string; citations: Citation[]; refused: boolean; replacedSentences: string[] };

const SEE_OFFICIAL: Record<Lang, string> = {
  en: "For the exact figure, see the official page linked below.",
  fr: "Pour le montant exact, consultez la page officielle ci-dessous.",
  zh: "具体数字请查看下方链接的官方页面。",
  hi: "सटीक राशि के लिए नीचे दिए गए आधिकारिक पेज को देखें।",
  ur: "درست رقم کے لیے نیچے دیے گئے سرکاری صفحے کو دیکھیں۔",
  pa: "ਸਹੀ ਰਕਮ ਲਈ ਹੇਠਾਂ ਦਿੱਤਾ ਸਰਕਾਰੀ ਪੰਨਾ ਵੇਖੋ।",
  ar: "للاطلاع على الرقم الدقيق، راجع الصفحة الرسمية أدناه.",
  es: "Para la cifra exacta, consulta la página oficial que aparece abajo.",
};
const SEE_OFFICIAL_SHAHMUKHI = "ٹھیک رقم لئی تھلے دتا گیا سرکاری صفحہ ویکھو۔";

// ---------- numbers ----------

const NUM_RE = /\d{1,3}(?:[,\u00A0\u202F ]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?/g;

/** Parse "8,157", "8 157", "146,66", "146.66", "30k" into numbers. */
export function extractNumbers(text: string): number[] {
  const s = asciiDigits(text);
  const out: number[] = [];
  for (const m of s.matchAll(new RegExp(NUM_RE.source + "(\\s?[kK]\\b)?", "g"))) {
    let raw = m[0].replace(/\s?[kK]$/, "");
    const k = /[kK]$/.test(m[0]);
    // Decide whether the last separator is a decimal mark.
    const lastSep = Math.max(raw.lastIndexOf(","), raw.lastIndexOf("."));
    if (lastSep >= 0 && raw.length - lastSep - 1 !== 3) {
      raw = raw.slice(0, lastSep).replace(/[^\d]/g, "") + "." + raw.slice(lastSep + 1);
    } else {
      raw = raw.replace(/[^\d]/g, "");
    }
    const n = Number(raw);
    if (!Number.isNaN(n)) out.push(k ? n * 1000 : n);
  }
  return out;
}

function numbersIn(value: unknown, acc: Set<string>) {
  if (value === null || value === undefined) return;
  if (typeof value === "number") { acc.add(norm(value)); return; }
  if (typeof value === "string") { extractNumbers(value).forEach((n) => acc.add(norm(n))); return; }
  if (Array.isArray(value)) { value.forEach((v) => numbersIn(v, acc)); return; }
  if (typeof value === "object") Object.values(value as object).forEach((v) => numbersIn(v, acc));
}
const norm = (n: number) => String(Math.round(n * 100) / 100);

// ---------- sentences ----------

/** Split into sentences without breaking decimals ("146.66") and keeping separators. */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  let buf = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    buf += c;
    const next = text[i + 1];
    // A list marker like "1. " at the start of a line is not a sentence end.
    const isListMarker = c === "." && /^\s*\d+$/.test(buf.slice(0, -1).split("\n").pop() ?? "");
    const endLatin = /[.!?]/.test(c) && (next === undefined || /\s/.test(next)) && !isListMarker;
    const endOther = /[。！？۔।]/.test(c);
    if (c === "\n" || endLatin || endOther) {
      out.push(buf);
      buf = "";
    }
  }
  if (buf) out.push(buf);
  return out;
}

const LIST_MARKER = /^(\s*)(?:\d+[.)]|[-*•])\s+/;

// ---------- citations ----------

function collectUrls(calls: ToolCallRecord[]): Citation[] {
  const out = new Map<string, string | null>();
  const add = (url: unknown, title: string | null = null) => {
    if (typeof url !== "string") return;
    try {
      const host = new URL(url).hostname;
      if (!ALLOWED_DOMAINS.includes(host)) return;
      if (!out.has(url) || (!out.get(url) && title)) out.set(url, title);
    } catch { /* not a URL */ }
  };
  for (const c of calls) {
    const o = c.output as Record<string, unknown> | null;
    if (!o || typeof o !== "object") continue;
    switch (c.tool) {
      case "check_eligibility": {
        const results = (o.results as { status: string; applyUrl: string; name: string }[]) ?? [];
        results.filter((r) => r.status === "eligible" || r.status === "likely").forEach((r) => add(r.applyUrl, r.name));
        break;
      }
      case "lookup_fact": add(o.sourceUrl); break;
      case "explain_item":
        add(o.applyUrl, (o.name as string) ?? null);
        ((o.claims as { sources: { url: string }[] }[]) ?? []).forEach((c) => c.sources.forEach((s) => add(s.url)));
        break;
      case "calculate": ((o.sources as string[]) ?? []).forEach((u) => add(u)); break;
      case "search_docs":
        ((o.passages as { url: string; title: string | null }[]) ?? []).forEach((p) => add(p.url, p.title));
        add(o.fallbackUrl);
        break;
    }
  }
  return [...out.entries()].slice(0, MAX_CITATIONS).map(([url, title]) => ({ url, title }));
}

// ---------- compose ----------

export function compose(args: {
  draft: string;
  toolCalls: ToolCallRecord[];
  userText: string;
  profile: unknown;
  language: Lang;
  script?: string | null;
}): Composed {
  let draft = (args.draft ?? "").trim();
  if (draft.includes(REFUSAL_MARKER)) {
    return { text: draft.replace(REFUSAL_MARKER, "").trim(), citations: [], refused: true, replacedSentences: [] };
  }
  // The model must not write links itself; strip any it produced.
  draft = draft.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1").replace(/https?:\/\/\S+/g, "").replace(/[ \t]+\n/g, "\n");

  const allowed = new Set<string>();
  args.toolCalls.forEach((c) => numbersIn(c.output, allowed));
  numbersIn(args.userText, allowed);
  numbersIn(args.profile, allowed);

  const replaced: string[] = [];
  const pointer = args.language === "pa" && args.script === "Arab" ? SEE_OFFICIAL_SHAHMUKHI : SEE_OFFICIAL[args.language];
  let pointerUsed = false;
  const sentences = splitSentences(draft).map((sentence) => {
    const body = sentence.replace(LIST_MARKER, "$1");
    const nums = extractNumbers(body);
    const bad = nums.filter((n) => !allowed.has(norm(n)));
    if (bad.length === 0) return sentence;
    replaced.push(sentence.trim());
    const trailing = sentence.match(/\s*$/)?.[0] ?? "";
    if (pointerUsed) return trailing.includes("\n") ? "\n" : "";
    pointerUsed = true;
    return pointer + (trailing || " ");
  });

  return { text: sentences.join("").replace(/\n{3,}/g, "\n\n").trim(), citations: collectUrls(args.toolCalls), refused: false, replacedSentences: replaced };
}
