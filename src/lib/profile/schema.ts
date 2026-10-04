import { z } from "zod";

// Single source of truth for everything the rules engine can reason about.
// Every key here is a valid `profile_facts.key`. Keep it small and boring.

export const Language = z.enum(["en", "fr", "zh", "hi", "ur", "pa", "ar", "es"]);
export const Script = z.enum(["Latn", "Hans", "Deva", "Arab", "Guru"]);
export const Province = z.enum(["ON", "BC", "AB", "SK", "MB", "QC", "NB", "NS", "PE", "NL", "YT", "NT", "NU"]);

export const Status = z.enum([
  "citizen",
  "permanent_resident",
  "work_permit",
  "study_permit",
  "refugee_claimant",
  "protected_person",
  "other",
]);

export const Persona = z.enum(["student", "newcomer", "family", "gig"]);

export const IncomeBand = z.enum(["under_20k", "20k_40k", "40k_60k", "60k_90k", "90k_plus", "prefer_not"]);

export const Child = z.object({
  age: z.number().int().min(0).max(25),
  hasResp: z.boolean().optional(),
  birthYear: z.number().int().min(1990).max(2100).optional(),
  // Year the child became a resident of Canada (newcomer children). Absent = born here / resident since birth.
  residencyStartYear: z.number().int().min(1990).max(2100).optional(),
  // Basic CESG already paid into the child's RESP, if known.
  grantsReceived: z.number().nonnegative().optional(),
});

export const ProfileSchema = z.object({
  language: Language.default("en"),
  script: Script.optional(),
  province: Province.optional(),
  status: Status.optional(),
  arrivalYear: z.number().int().min(1950).max(2100).optional(),
  personas: z.array(Persona).default([]),
  age: z.number().int().min(16).max(120).optional(),
  maritalStatus: z.enum(["single", "married", "common_law", "separated", "widowed"]).optional(),
  children: z.array(Child).default([]),
  incomeBand: IncomeBand.optional(),
  householdIncomeBand: IncomeBand.optional(),
  isStudent: z.boolean().optional(),
  tuitionPaidThisYear: z.boolean().optional(),
  housing: z.enum(["rent", "own", "with_family", "other"]).optional(),
  annualRent: z.number().nonnegative().optional(),
  selfEmployed: z.boolean().optional(),
  selfEmploymentRevenueBand: IncomeBand.optional(),
  filedTaxesLastYear: z.boolean().optional(),
  paidChildcareThisYear: z.boolean().optional(),
  // Added for v1 programs (CDCP, student loan interest, HST for ride-share, CWB).
  hasDentalInsurance: z.boolean().optional(),
  paidStudentLoanInterest: z.boolean().optional(),
  rideshareDriver: z.boolean().optional(),
  hasEmploymentIncome: z.boolean().optional(),
  // v2 / milestone 1: registered accounts.
  birthYear: z.number().int().min(1900).max(2100).optional(),
  alwaysLivedInCanada: z.boolean().optional(),
  // Year you became a resident of Canada for tax purposes. If absent, arrivalYear is used as an assumption.
  residencyStartYear: z.number().int().min(1950).max(2100).optional(),
  hasTfsa: z.boolean().optional(),
  tfsaContributedTotal: z.number().nonnegative().optional(),
  firstTimeHomeBuyer: z.boolean().optional(),
  hasFhsa: z.boolean().optional(),
  fhsaOpenedYear: z.number().int().min(2023).max(2100).optional(),
  fhsaContributedTotal: z.number().nonnegative().optional(),
});

export type Profile = z.infer<typeof ProfileSchema>;
export type ProfileKey = keyof Profile;

// Which questions the chat onboarding may ask for each persona, in order.
// The onboarding asks only for keys that are still missing.
export const QUESTION_ORDER: Record<z.infer<typeof Persona>, ProfileKey[]> = {
  student: ["province", "age", "status", "isStudent", "tuitionPaidThisYear", "paidStudentLoanInterest", "incomeBand", "hasEmploymentIncome", "housing", "filedTaxesLastYear"],
  newcomer: ["province", "age", "status", "arrivalYear", "maritalStatus", "children", "incomeBand", "hasEmploymentIncome", "housing", "filedTaxesLastYear"],
  family: ["province", "age", "maritalStatus", "children", "householdIncomeBand", "paidChildcareThisYear", "hasDentalInsurance", "housing", "filedTaxesLastYear"],
  gig: ["province", "age", "selfEmployed", "rideshareDriver", "selfEmploymentRevenueBand", "incomeBand", "filedTaxesLastYear"],
};

// Questions that get a "why do you ask?" explanation and a skip button.
// Keys whose answer is a number typed by the user (no buttons).
export const NUMERIC_KEYS: ProfileKey[] = ["age", "arrivalYear", "annualRent", "birthYear", "residencyStartYear", "tfsaContributedTotal", "fhsaOpenedYear", "fhsaContributedTotal"];

// Validate one key/value against the schema. Used by update_profile and the
// onboarding form so both paths share the same rules.
export function validateFact(key: string, value: unknown): { ok: true; key: ProfileKey; value: unknown } | { ok: false; error: string } {
  const shape = ProfileSchema.shape as Record<string, z.ZodTypeAny>;
  const field = shape[key];
  if (!field) return { ok: false, error: `unknown_key:${key}` };
  const parsed = field.safeParse(value);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
  return { ok: true, key: key as ProfileKey, value: parsed.data };
}

export const SENSITIVE_KEYS: ProfileKey[] = ["incomeBand", "householdIncomeBand", "status", "maritalStatus"];
