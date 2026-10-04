import { embed } from "../ai/provider";
import { getProgram } from "../rules/programs";
import { adminClient } from "../supabase/server";

export type Passage = { text: string; heading: string | null; url: string; title: string | null; score: number };
export type SearchResult = { passages: Passage[]; abstain: boolean; reason?: string; fallbackUrl?: string };

const MIN_SCORE = Number(process.env.RAG_MIN_SCORE ?? 0.45);

const ragConfigured = () => !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY;

/** Optional cross-encoder rerank (e.g. bge-reranker behind TEI's /rerank). Identity if not configured. */
async function rerank(query: string, passages: Passage[]): Promise<Passage[]> {
  const url = process.env.RERANK_URL;
  if (!url || passages.length < 2) return passages;
  try {
    const res = await fetch(`${url}/rerank`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, texts: passages.map((p) => p.text) }),
    });
    const ranked = (await res.json()) as { index: number; score: number }[];
    return ranked.map((r) => ({ ...passages[r.index], score: r.score }));
  } catch {
    return passages;
  }
}

export async function searchDocs(query: string, opts: { programId?: string; limit?: number } = {}): Promise<SearchResult> {
  const fallbackUrl = (opts.programId && getProgram(opts.programId)?.apply_url) || "https://www.canada.ca/en/services/benefits.html";
  if (!ragConfigured()) return { passages: [], abstain: true, reason: "search_not_configured", fallbackUrl };
  const [vector] = await embed([query]);
  const { data, error } = await adminClient().rpc("search_chunks", {
    query_embedding: vector as unknown as string,
    query_text: query,
    match_count: Math.max(opts.limit ?? 6, 8),
    filter_program: opts.programId ?? null,
  });
  if (error) return { passages: [], abstain: true, reason: `search_error:${error.message}`, fallbackUrl };
  let passages: Passage[] = ((data ?? []) as { text: string; heading: string | null; url: string; title: string | null; score: number }[]).map((r) => ({
    text: r.text, heading: r.heading, url: r.url, title: r.title, score: r.score,
  }));
  // Abstain on the hybrid score (stable scale), before any reranker rescales it.
  const top = passages[0]?.score ?? 0;
  passages = (await rerank(query, passages)).slice(0, opts.limit ?? 6);
  if (top < MIN_SCORE) return { passages: [], abstain: true, reason: "low_confidence", fallbackUrl: passages[0]?.url ?? fallbackUrl };
  return { passages, abstain: false };
}
