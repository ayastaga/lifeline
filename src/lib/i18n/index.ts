import ar from "./strings/ar.json";
import en from "./strings/en.json";
import es from "./strings/es.json";
import fr from "./strings/fr.json";
import hi from "./strings/hi.json";
import pa from "./strings/pa.json";
import ur from "./strings/ur.json";
import zh from "./strings/zh.json";
import type { Lang } from "./detect";

export type { Lang } from "./detect";
export { isRtl } from "./detect";

const TABLES: Record<Lang, Record<string, string>> = { en, fr, es, zh, hi, ur, pa, ar };

export const LANGUAGES: { code: Lang; native: string; htmlLang: string }[] = [
  { code: "en", native: "English", htmlLang: "en-CA" },
  { code: "fr", native: "Français", htmlLang: "fr-CA" },
  { code: "zh", native: "中文", htmlLang: "zh-Hans" },
  { code: "hi", native: "हिन्दी", htmlLang: "hi" },
  { code: "ur", native: "اردو", htmlLang: "ur" },
  { code: "pa", native: "ਪੰਜਾਬੀ", htmlLang: "pa-Guru" },
  { code: "ar", native: "العربية", htmlLang: "ar" },
  { code: "es", native: "Español", htmlLang: "es" },
];

export const LOCALES: Record<Lang, string> = { en: "en-CA", fr: "fr-CA", zh: "zh-CN", hi: "hi-IN", ur: "ur-PK", pa: "pa-IN", ar: "ar", es: "es" };

/** Translate with English fallback (action/reason strings are EN+FR only for now). */
export function t(lang: Lang, key: string, vars?: Record<string, string | number>): string {
  let s = TABLES[lang]?.[key] ?? TABLES.en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export function hasKey(lang: Lang, key: string) {
  return key in (TABLES[lang] ?? {});
}

export function money(lang: Lang, n: number) {
  return new Intl.NumberFormat(LOCALES[lang], { style: "currency", currency: "CAD", maximumFractionDigits: n % 1 === 0 ? 0 : 2, numberingSystem: "latn" } as Intl.NumberFormatOptions).format(n);
}

export function date(lang: Lang, iso: string) {
  return new Intl.DateTimeFormat(LOCALES[lang], { year: "numeric", month: "long", day: "numeric", timeZone: "UTC", numberingSystem: "latn" } as Intl.DateTimeFormatOptions).format(new Date(iso + "T00:00:00Z"));
}

export function tables() {
  return TABLES;
}
