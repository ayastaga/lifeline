import { parseStatement, situationHints } from "@/lib/statements";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 2_000_000;

// CSV is parsed in memory and discarded. Only categorized rows are stored
// (per user, RLS) and only derived hints are staged for confirmation.
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "no_file" }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "file_too_large" }, { status: 413 });
  try {
    const { rows, skipped } = parseStatement(await file.text());
    if (rows.length === 0) return Response.json({ error: "no_rows" }, { status: 422 });
    const store = await getStore();
    await store.replaceTransactions(rows);
    const { hints, candidates } = situationHints(rows);
    const profile = await store.getProfile();
    // Don't propose what the user already confirmed.
    const fresh = candidates.filter((c) => !(c.key in profile.confirmed));
    if (fresh.length) await store.stageFacts(fresh);
    return Response.json({ count: rows.length, skipped, hints, staged: fresh.map((c) => c.key) });
  } catch (e) {
    return Response.json({ error: "parse_failed", message: (e as Error).message }, { status: 422 });
  }
}
