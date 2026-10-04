import type { Persona, ProfileKey } from "../profile/schema";
import type { z } from "zod";

export type EligibilityStatus = "eligible" | "likely" | "not_eligible" | "need_more_info";
export type ProgramKind = "benefit" | "credit" | "obligation" | "info" | "account";
export type RoadmapTier = 1 | 2 | 3 | 4;

export type Condition = Record<string, unknown>;
export type Rule = { if: Condition; then: EligibilityStatus; reason: string } | { default: EligibilityStatus; reason: string };

export type Program = {
  id: string;
  name: string;
  level: "federal" | "provincial";
  jurisdiction: string;
  personas: z.infer<typeof Persona>[];
  apply_url: string;
  kind: ProgramKind;
  verify: boolean;
  verify_note?: string;
  requires: ProfileKey[];
  rules: Rule[];
  fact_keys: string[];
  estimate?: "cgeb" | "ostc" | "cwb" | "ccb" | "ocb" | "cesg" | "clb";
  /** 1 = do first (deadline / unlocks money), 2 = loses value each year, 3 = set up once, 4 = habit. */
  roadmap_tier: RoadmapTier;
  /** Personal calculator run for this program when the person may qualify. */
  calculator?: "tfsa_room" | "fhsa_room" | "resp_catch_up";
  plan_item: { title_key: string; action_key: string; deadline: string | null };
};

export type EligibilityResult = {
  programId: string;
  name: string;
  kind: ProgramKind;
  status: EligibilityStatus;
  reason: string;
  missing: ProfileKey[];
  factKeys: string[];
  applyUrl: string;
  verified: boolean;
  /** Profile keys this decision actually depended on (requires + the matched rule). */
  usedFacts: ProfileKey[];
};
