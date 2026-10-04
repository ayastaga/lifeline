import { ingestAll } from "@/lib/rag/ingest";

export const runtime = "nodejs";
export const maxDuration = 300;

// Admin-only re-crawl (also runnable as `npm run ingest`). Guarded by a shared secret.
export async function POST(req: Request) {
  const secret = process.env.INGEST_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const report = await ingestAll({ log: () => {} });
  return Response.json(report);
}
