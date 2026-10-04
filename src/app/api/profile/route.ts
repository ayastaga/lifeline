import { z } from "zod";
import { nextQuestion } from "@/lib/profile/onboarding";
import { Language, validateFact } from "@/lib/profile/schema";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function snapshot() {
  const store = await getStore();
  const profile = await store.getProfile();
  const known = new Set([...Object.keys(profile.confirmed), ...profile.pending.map((p) => p.key)]);
  const personas = (profile.confirmed.personas ?? (profile.pending.find((p) => p.key === "personas")?.value as string[] | undefined) ?? []) as never[];
  return { ...profile, storage: store.kind, nextQuestion: nextQuestion(known, personas) };
}

export async function GET() {
  return Response.json(await snapshot());
}

const Body = z.discriminatedUnion("action", [
  // Onboarding answers and edits: staged, then confirmed by the user on the card.
  z.object({ action: z.literal("stage"), facts: z.array(z.object({ key: z.string(), value: z.unknown() })).min(1) }),
  z.object({ action: z.literal("confirm"), keys: z.array(z.string()).min(1) }),
  z.object({ action: z.literal("reject"), keys: z.array(z.string()).min(1) }),
  z.object({ action: z.literal("clear"), keys: z.array(z.string()).min(1) }),
  z.object({ action: z.literal("language"), language: Language }),
]);

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
  const store = await getStore();
  const b = parsed.data;
  switch (b.action) {
    case "stage": {
      const errors: { key: string; error: string }[] = [];
      const ok = [];
      for (const f of b.facts) {
        const v = validateFact(f.key, f.value);
        if (v.ok) ok.push({ key: v.key, value: v.value, source: "user" as const });
        else errors.push({ key: f.key, error: v.error });
      }
      if (ok.length) await store.stageFacts(ok);
      if (errors.length) return Response.json({ ...(await snapshot()), errors }, { status: 422 });
      break;
    }
    case "confirm": await store.confirmFacts(b.keys); break;
    case "reject": await store.rejectFacts(b.keys); break;
    case "clear": await store.clearFacts(b.keys); break;
    case "language": await store.setLanguage(b.language, null); break;
  }
  return Response.json(await snapshot());
}
