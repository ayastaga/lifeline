import { z } from "zod";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";

const Body = z.object({
  messageId: z.string().uuid().nullable().optional(),
  programId: z.string().nullable().optional(),
  kind: z.enum(["thumbs_up", "thumbs_down", "applied", "approved", "denied"]),
  note: z.string().max(1000).nullable().optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 });
  const store = await getStore();
  await store.addFeedback(parsed.data);
  return Response.json({ ok: true });
}
