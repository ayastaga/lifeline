// Per-message language + script detection. Script comes from Unicode blocks;
// language inside a script uses distinctive letters and short word lists.
// Deliberately small and testable; swap for a language-id library if needed.

export type Lang = "en" | "fr" | "zh" | "hi" | "ur" | "pa" | "ar" | "es";
export type Script = "Latn" | "Hans" | "Deva" | "Arab" | "Guru";
/** `unsupported`: the text looks like a language outside Lang; `language` is then the English fallback. */
export type Detection = { language: Lang; script: Script; romanized: boolean; confidence: number; unsupported?: boolean };

const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

const URDU_LETTERS = /[ٹڈڑںےہھۓ]/g; // used in Urdu/Shahmukhi, not standard Arabic
const SHAHMUKHI_HINTS = /(ਂ|ݨ|ڄ|ٻ|\bنوں\b|\bتسیں\b|\bساڈا\b|\bکیہ\b|\bوچ\b)/g;
const ARABIC_ONLY = /[ةإأىؤ]/g;

const WORDS: Record<string, string[]> = {
  en: ["the", "and", "is", "i", "my", "what", "how", "can", "do", "for", "to", "of", "a"],
  fr: ["le", "la", "les", "et", "est", "je", "mon", "quoi", "comment", "pour", "des", "une", "puis", "suis", "j'ai"],
  es: ["el", "la", "los", "y", "es", "yo", "mi", "qué", "como", "cómo", "para", "una", "puedo", "soy", "tengo"],
  // Romanized South Asian (common in chat).
  pa_rom: ["mainu", "tusi", "kiwe", "kida", "ki", "nu", "vich", "sanu", "assi", "karda", "kardi", "hega", "tuhada"],
  hi_rom: ["mujhe", "kya", "hai", "mera", "meri", "kaise", "kitna", "nahi", "aap", "hum", "karna", "chahiye"],
};

function hasKnownWord(text: string): boolean {
  const tokens = text.toLowerCase().normalize("NFC").split(/[^\p{L}']+/u);
  return Object.values(WORDS).some((list) => tokens.some((t) => list.includes(t)));
}

function latinLanguage(text: string): { lang: Lang; romanized: boolean; confidence: number } {
  const tokens = text.toLowerCase().normalize("NFC").split(/[^\p{L}']+/u).filter(Boolean);
  const scores: Record<string, number> = {};
  for (const [k, list] of Object.entries(WORDS)) scores[k] = tokens.filter((t) => list.includes(t)).length;
  if (/[àâçèéêëîïôûùüÿœ]/i.test(text)) scores.fr += 1.5;
  if (/[ñ¿¡áíóú]/i.test(text)) scores.es += 1.5;
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  if (!best || best[1] === 0) return { lang: "en", romanized: false, confidence: 0.3 };
  const total = Object.values(scores).reduce((a, b) => a + b, 0) || 1;
  if (best[0] === "pa_rom") return { lang: "pa", romanized: true, confidence: best[1] / total };
  if (best[0] === "hi_rom") return { lang: "hi", romanized: true, confidence: best[1] / total };
  return { lang: best[0] as Lang, romanized: false, confidence: best[1] / total };
}

/**
 * @param hint the user's preferred language from their profile. Used to break
 * ties the text cannot settle (Urdu vs Shahmukhi Punjabi share a script).
 */
export function detectLanguage(text: string, hint?: Lang): Detection {
  const guru = count(text, /[\u0A00-\u0A7F]/g);
  const deva = count(text, /[\u0900-\u097F]/g);
  const han = count(text, /[\u4E00-\u9FFF\u3400-\u4DBF]/g);
  const arab = count(text, /[\u0600-\u06FF\u0750-\u077F]/g);
  const latin = count(text, /[A-Za-zÀ-ÿ]/g);
  const max = Math.max(guru, deva, han, arab, latin);
  // Letters from scripts we don't support (Hangul, kana, Cyrillic, Tamil, ...).
  const other = count(text, /(?=\p{L})[^\p{Script=Latin}\p{Script=Han}\p{Script=Devanagari}\p{Script=Gurmukhi}\p{Script=Arabic}]/gu);
  if (other > max) return { language: "en", script: "Latn", romanized: false, confidence: 0, unsupported: true };

  if (max === 0) return { language: hint ?? "en", script: hint === "zh" ? "Hans" : "Latn", romanized: false, confidence: 0 };
  if (max === guru) return { language: "pa", script: "Guru", romanized: false, confidence: 1 };
  if (max === deva) return { language: "hi", script: "Deva", romanized: false, confidence: 1 };
  if (max === han) return { language: "zh", script: "Hans", romanized: false, confidence: 1 };
  if (max === arab) {
    const urduish = count(text, URDU_LETTERS);
    const shahmukhi = count(text, SHAHMUKHI_HINTS);
    const arabic = count(text, ARABIC_ONLY);
    if (shahmukhi > 0 || (hint === "pa" && urduish >= arabic)) return { language: "pa", script: "Arab", romanized: false, confidence: shahmukhi > 0 ? 0.8 : 0.5 };
    if (urduish > arabic) return { language: "ur", script: "Arab", romanized: false, confidence: 0.85 };
    if (arabic > 0) return { language: "ar", script: "Arab", romanized: false, confidence: 0.85 };
    return { language: hint === "ur" || hint === "pa" ? hint : "ar", script: "Arab", romanized: false, confidence: 0.5 };
  }
  // Latin script. Short messages ("ok", "yes") follow the user's preference.
  const latinResult = latinLanguage(text);
  // A full sentence with no known function words is likely another Latin-script language (German, Portuguese, ...).
  if (latinResult.confidence < 0.5 && text.trim().split(/\s+/).length >= 5 && latinResult.lang === "en" && !hasKnownWord(text)) {
    return { language: "en", script: "Latn", romanized: false, confidence: 0, unsupported: true };
  }
  if (latinResult.confidence < 0.5 && hint && text.trim().split(/\s+/).length <= 3) {
    return { language: hint, script: "Latn", romanized: !["en", "fr", "es"].includes(hint), confidence: 0.4 };
  }
  return { language: latinResult.lang, script: "Latn", romanized: latinResult.romanized, confidence: latinResult.confidence };
}

export const RTL_LANGS: Lang[] = ["ar", "ur"];
export const isRtl = (lang: Lang, script?: Script) => RTL_LANGS.includes(lang) || (lang === "pa" && script === "Arab");

/** Convert Devanagari, Gurmukhi, Arabic-Indic and Persian digits to ASCII. */
export function asciiDigits(s: string): string {
  return s.replace(/[\u0966-\u096F\u0A66-\u0A6F\u0660-\u0669\u06F0-\u06F9]/g, (d) => {
    const c = d.charCodeAt(0);
    for (const base of [0x0966, 0x0a66, 0x0660, 0x06f0]) if (c >= base && c <= base + 9) return String(c - base);
    return d;
  });
}
