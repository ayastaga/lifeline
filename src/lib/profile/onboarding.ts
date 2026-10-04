import type { z } from "zod";
import { NUMERIC_KEYS, Persona, ProfileSchema, QUESTION_ORDER, SENSITIVE_KEYS, type ProfileKey } from "./schema";

// Chooses the next onboarding question: the first key, across the user's
// personas in QUESTION_ORDER, that is neither confirmed nor pending.

export type Question = {
  key: ProfileKey;
  input: "enum" | "boolean" | "number" | "children" | "personas";
  options: string[];
  sensitive: boolean;
};

function unwrap(t: z.ZodTypeAny): z.ZodTypeAny {
  let cur = t;
  for (let i = 0; i < 5; i++) {
    const def = cur._def as { innerType?: z.ZodTypeAny; typeName?: string };
    if (def.innerType) cur = def.innerType;
    else break;
  }
  return cur;
}

export function describeKey(key: ProfileKey): Question {
  if (key === "children") return { key, input: "children", options: [], sensitive: false };
  if (key === "personas") return { key, input: "personas", options: Persona.options, sensitive: false };
  if (NUMERIC_KEYS.includes(key)) return { key, input: "number", options: [], sensitive: SENSITIVE_KEYS.includes(key) };
  const field = unwrap((ProfileSchema.shape as Record<string, z.ZodTypeAny>)[key]);
  const typeName = (field._def as { typeName: string }).typeName;
  if (typeName === "ZodBoolean") return { key, input: "boolean", options: ["true", "false"], sensitive: SENSITIVE_KEYS.includes(key) };
  if (typeName === "ZodEnum") return { key, input: "enum", options: (field as z.ZodEnum<[string, ...string[]]>).options, sensitive: SENSITIVE_KEYS.includes(key) };
  return { key, input: "number", options: [], sensitive: SENSITIVE_KEYS.includes(key) };
}

export function nextQuestion(known: Set<string>, personas: z.infer<typeof Persona>[]): Question | null {
  if (personas.length === 0) return describeKey("personas");
  const order = [...new Set(personas.flatMap((p) => QUESTION_ORDER[p]))];
  // Income: households with a partner or children are asked household income instead.
  const key = order.find((k) => !known.has(k));
  return key ? describeKey(key) : null;
}

/** Parse "2, 5" / "2 and 5" / "ages 2 5" into children. Empty string = no children. */
export function parseChildren(text: string): { age: number }[] | null {
  const nums = (text.match(/\d+/g) ?? []).map(Number);
  if (!text.trim()) return [];
  if (nums.length === 0 || nums.some((n) => n > 25)) return null;
  return nums.map((age) => ({ age }));
}
