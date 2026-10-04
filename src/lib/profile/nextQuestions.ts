import { buildRoadmap } from "../roadmap";
import type { PartialProfile } from "../rules/engine";
import { describeKey, type Question } from "./onboarding";
import { ProfileSchema, type ProfileKey } from "./schema";

// "I'll only ask for things that can change what I tell you."
// Each unknown profile key is scored by how many roadmap items it would unblock
// or complete, weighted by how much those items matter (tier 1 most).

const WEIGHT: Record<number, number> = { 1: 4, 2: 3, 3: 2, 4: 1 };
const PROFILE_KEYS = new Set(Object.keys(ProfileSchema.shape));
// Asked first when nothing is known: they decide which rules apply at all.
const FOUNDATION: ProfileKey[] = ["province", "age", "status"];

export type RankedQuestion = Question & { score: number; unblocks: string[] };

export function nextQuestions(profile: PartialProfile, exclude: Set<string>, opts: { limit?: number; currentYear?: number } = {}): RankedQuestion[] {
  const rm = buildRoadmap(profile, { currentYear: opts.currentYear });
  const score = new Map<string, { s: number; programs: Set<string> }>();
  const bump = (key: string, tier: number, program: string) => {
    if (!PROFILE_KEYS.has(key) || exclude.has(key) || key in profile) return;
    const cur = score.get(key) ?? { s: 0, programs: new Set() };
    cur.s += WEIGHT[tier] ?? 1;
    cur.programs.add(program);
    score.set(key, cur);
  };
  for (const i of [...rm.needsFact, ...rm.items]) for (const k of i.why.unknown) bump(k, i.tier, i.programId);
  FOUNDATION.forEach((k, idx) => { if (!(k in profile) && !exclude.has(k)) { const cur = score.get(k) ?? { s: 0, programs: new Set<string>() }; cur.s += 100 - idx; score.set(k, cur); } });
  return [...score.entries()]
    .sort((a, b) => b[1].s - a[1].s)
    .slice(0, opts.limit ?? 3)
    .map(([key, v]) => ({ ...describeKey(key as ProfileKey), score: v.s, unblocks: [...v.programs] }));
}
