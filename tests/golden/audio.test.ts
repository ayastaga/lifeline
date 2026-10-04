import { config } from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { asciiDigits, type Lang } from "@/lib/i18n/detect";
import { sttFor } from "@/lib/speech/router";
import { KEYTERMS } from "@/lib/speech/types";
import manifest from "./audio/manifest.json";

config({ path: ".env.local" });

// Speech-to-text accuracy on the facts that matter. Runs only for cases whose
// audio file exists, and only with provider keys. Compare providers by setting
// SPEECH_STT_ROUTES, e.g. {"hi":"openai"} vs {"hi":"sarvam"}.
const dir = path.join(__dirname, "audio");
const cases = manifest.cases.filter((c) => existsSync(path.join(dir, c.file)));
const hasKey = !!process.env.OPENAI_API_KEY || !!process.env.SARVAM_API_KEY;

describe.skipIf(!hasKey || cases.length === 0)("golden audio", () => {
  it.each(cases)("$id", async (c) => {
    const stt = sttFor(c.language as Lang);
    const r = await stt.transcribe(readFileSync(path.join(dir, c.file)), { mime: "audio/m4a", language: c.language as Lang, keyterms: KEYTERMS });
    const text = asciiDigits(r.text);
    for (const n of c.must_contain) expect(text, `${stt.name} lost "${n}"`).toContain(n);
    for (const term of c.must_contain_terms) expect(text.toUpperCase(), `${stt.name} lost "${term}"`).toContain(term.toUpperCase());
  });
});
