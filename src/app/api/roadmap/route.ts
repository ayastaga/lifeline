import { nextQuestions } from "@/lib/profile/nextQuestions";
import { buildRoadmap } from "@/lib/roadmap";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Roadmap from CONFIRMED facts, with claims and "why", plus the next most useful questions.
export async function GET(req: Request) {
  const skip = new URL(req.url).searchParams.get("skip")?.split(",").filter(Boolean) ?? [];
  const store = await getStore();
  const { confirmed, pending } = await store.getProfile();
  return Response.json({
    ...buildRoadmap(confirmed),
    nextQuestions: nextQuestions(confirmed, new Set([...skip, ...pending.map((p) => p.key)])),
  });
}
