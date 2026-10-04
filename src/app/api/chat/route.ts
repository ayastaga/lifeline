import { z } from "zod";
import { Language } from "@/lib/profile/schema";
import { runTurn, type TurnEvent } from "@/lib/ai/orchestrator";
import { getProvider } from "@/lib/ai/provider";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ message: z.string().trim().min(1).max(4000), replyLanguage: Language.optional() });

// Streams newline-delimited JSON events: progress while tools run, then one
// "final" event with the checked, cited answer.
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "invalid_body" }, { status: 400 });
  const store = await getStore();
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: TurnEvent | { type: "error"; message: string }) => controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
      try {
        await runTurn({ message: parsed.data.message, replyLanguage: parsed.data.replyLanguage, store, provider: getProvider(), onEvent: send });
      } catch (e) {
        // No user data in logs: only the error message.
        console.error("chat_error", (e as Error).message);
        send({ type: "error", message: "turn_failed" });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
