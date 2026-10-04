import { buildPlan } from "@/lib/plan";
import { getStore } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The plan uses CONFIRMED facts only.
export async function GET() {
  const store = await getStore();
  const { confirmed } = await store.getProfile();
  return Response.json(buildPlan(confirmed));
}
