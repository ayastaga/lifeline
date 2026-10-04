import { money, t, type Lang } from "./index";

/** Human-readable value for a profile fact in the given language (card, read-back). */
export function formatValue(lang: Lang, key: string, v: unknown): string {
  if (v === null || v === undefined) return "";
  if (key === "personas" && Array.isArray(v)) return v.map((p) => t(lang, `opt.${p}`)).join(", ");
  if (key === "children" && Array.isArray(v)) {
    if (v.length === 0) return t(lang, "onboard.no_children");
    return `${v.length} (${t(lang, "label.children_ages", { ages: v.map((c: { age: number }) => c.age).join(", ") })})`;
  }
  if (typeof v === "boolean") return t(lang, v ? "opt.true" : "opt.false");
  if ((key === "annualRent" || key.endsWith("ContributedTotal")) && typeof v === "number") return money(lang, v);
  if (key === "housing" && v === "other") return t(lang, "opt.other_housing");
  if (typeof v === "string") return t(lang, `opt.${v}`) === `opt.${v}` ? v : t(lang, `opt.${v}`);
  return String(v);
}

/** "I heard: Resident since 2024, Age 34. Is that right?" built by code, never by the model. */
export function readback(lang: Lang, facts: { key: string; value: unknown }[]): string {
  const list = facts.map((f) => `${t(lang, `label.${f.key}`)} ${formatValue(lang, f.key, f.value)}`).join(", ");
  return t(lang, "readback", { facts: list });
}
