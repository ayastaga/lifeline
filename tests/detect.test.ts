import { describe, expect, it } from "vitest";
import { detectLanguage } from "@/lib/i18n/detect";

describe("language + script detection", () => {
  const cases: [string, string, string][] = [
    ["What benefits can I get?", "en", "Latn"],
    ["Quelles prestations puis-je recevoir? Je suis étudiant.", "fr", "Latn"],
    ["¿Qué beneficios puedo recibir? Tengo dos hijos.", "es", "Latn"],
    ["我去年刚来加拿大，需要报税吗？", "zh", "Hans"],
    ["मुझे कौन से लाभ मिल सकते हैं?", "hi", "Deva"],
    ["ਜੇ ਮੈਂ ਹਰ ਮਹੀਨੇ RESP ਵਿੱਚ 100 ਡਾਲਰ ਪਾਵਾਂ ਤਾਂ ਸਰਕਾਰ ਕਿੰਨਾ ਪਾਉਂਦੀ ਹੈ?", "pa", "Guru"],
    ["کیا مجھے HST کے لیے رجسٹر کرنا ہوگا؟", "ur", "Arab"],
    ["هل يمكنني الحصول على إعانة الطفل؟", "ar", "Arab"],
    ["mainu ki benefits mil sakde ne, tusi dasso", "pa", "Latn"],
    ["mujhe kya benefits mil sakte hai", "hi", "Latn"],
  ];
  it.each(cases)("%s -> %s/%s", (text, lang, script) => {
    const d = detectLanguage(text);
    expect(d.language).toBe(lang);
    expect(d.script).toBe(script);
  });
  it("Shahmukhi Punjabi with a Punjabi profile hint", () => {
    expect(detectLanguage("مینوں کیہ ملے گا؟", "pa")).toMatchObject({ language: "pa", script: "Arab" });
  });
  it.each([
    ["Ich habe zwei Kinder und wohne in Toronto", "German"],
    ["Eu tenho dois filhos e moro em Toronto", "Portuguese"],
    ["저는 작년에 캐나다에 왔어요", "Korean"],
    ["Я приехал в Канаду в прошлом году", "Russian"],
    ["நான் கடந்த ஆண்டு கனடா வந்தேன்", "Tamil"],
    ["去年カナダに来ました。税金を払う必要がありますか", "Japanese"],
  ])("unsupported: %s (%s)", (text) => {
    expect(detectLanguage(text, "hi")).toMatchObject({ language: "en", unsupported: true });
  });
  it("plain English is not flagged unsupported", () => {
    expect(detectLanguage("Child benefit eligibility for newcomers in Ontario").unsupported).toBeUndefined();
  });
  it("short replies follow the profile language", () => {
    expect(detectLanguage("ok", "fr").language).toBe("fr");
  });
});
