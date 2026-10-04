import type { Profile, ProfileKey } from "../profile/schema";
import { PROGRAMS } from "./programs";
import type { Condition, EligibilityResult, Program } from "./types";

// Deterministic eligibility. Input is a PARTIAL profile: a key that is absent
// is unknown, which is different from an empty value (children: [] means
// "no children", a missing children key means "we have not asked").

export type PartialProfile = Partial<Profile>;

const has = (p: PartialProfile, k: string) =>
  Object.prototype.hasOwnProperty.call(p, k) && (p as Record<string, unknown>)[k] !== undefined && (p as Record<string, unknown>)[k] !== null;

function matchOp(actual: unknown, spec: unknown): boolean {
  // Bare value means equality.
  if (spec === null || typeof spec !== "object" || Array.isArray(spec)) return actual === spec;
  const ops = spec as Record<string, unknown>;
  return Object.entries(ops).every(([op, expected]) => {
    switch (op) {
      case "eq": return actual === expected;
      // "not equal" is true for an unknown value: unknown is not X.
      case "ne": return actual !== expected;
      case "lt": return typeof actual === "number" && actual < (expected as number);
      case "lte": return typeof actual === "number" && actual <= (expected as number);
      case "gt": return typeof actual === "number" && actual > (expected as number);
      case "gte": return typeof actual === "number" && actual >= (expected as number);
      case "in": return Array.isArray(expected) && expected.includes(actual as never);
      case "len": return Array.isArray(actual) && actual.length === expected;
      case "any": return Array.isArray(actual) && actual.some((el) => matchCondition(el as Record<string, unknown>, expected as Condition));
      case "none": return Array.isArray(actual) && !actual.some((el) => matchCondition(el as Record<string, unknown>, expected as Condition));
      default: throw new Error(`unknown_operator:${op}`);
    }
  });
}

export function matchCondition(obj: Record<string, unknown>, cond: Condition): boolean {
  return Object.entries(cond).every(([field, spec]) => {
    const present = Object.prototype.hasOwnProperty.call(obj, field) && obj[field] !== undefined && obj[field] !== null;
    const isNe = spec !== null && typeof spec === "object" && !Array.isArray(spec) && Object.keys(spec as object).every((k) => k === "ne");
    if (!present && !isNe) return false; // unknown never satisfies a positive test
    return matchOp(obj[field], spec);
  });
}

export function evaluateProgram(program: Program, profile: PartialProfile): EligibilityResult {
  const base = {
    programId: program.id,
    name: program.name,
    kind: program.kind,
    factKeys: program.fact_keys,
    applyUrl: program.apply_url,
    verified: !program.verify,
  };
  const missing = program.requires.filter((k) => !has(profile, k)) as ProfileKey[];
  const known = (keys: string[]) => keys.filter((k) => has(profile, k)) as ProfileKey[];
  if (missing.length > 0) return { ...base, status: "need_more_info", reason: "missing_profile_facts", missing, usedFacts: known(program.requires) };

  // Keys of rules that were checked and did not fire still shaped the answer.
  const checked = new Set<string>(program.requires);
  for (const rule of program.rules) {
    if ("default" in rule) return { ...base, status: rule.default, reason: rule.reason, missing: [], usedFacts: known([...checked]) };
    Object.keys(rule.if).forEach((k) => checked.add(k));
    if (matchCondition(profile as Record<string, unknown>, rule.if)) {
      return { ...base, status: rule.then, reason: rule.reason, missing: [], usedFacts: known([...new Set([...program.requires, ...Object.keys(rule.if)])]) };
    }
  }
  return { ...base, status: "need_more_info", reason: "no_rule_matched", missing: [], usedFacts: known([...checked]) };
}

/**
 * No persona tracks: every program is evaluated, and the rules decide relevance
 * from life circumstances. `programIds` narrows the set for a specific question.
 */
export function programsFor(_profile: PartialProfile, programIds?: string[]): Program[] {
  if (programIds?.length) return PROGRAMS.filter((p) => programIds.includes(p.id));
  return PROGRAMS;
}

export function evaluate(profile: PartialProfile, programIds?: string[]): EligibilityResult[] {
  return programsFor(profile, programIds).map((p) => evaluateProgram(p, profile));
}
