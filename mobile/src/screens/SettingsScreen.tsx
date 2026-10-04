import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { LANGUAGES, t } from "../../../src/lib/i18n";
import { signInWithGoogle, signOut, supabase, useAccountEmail } from "../auth";
import { C, dirStyle, F } from "../theme";
import type { Lang, Settings } from "../types";

function Chips<T extends string>({ value, options, onChange }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <View style={s.chips}>
      {options.map((o) => (
        <Pressable key={o.v} onPress={() => onChange(o.v)} accessibilityState={{ selected: value === o.v }} style={[s.chip, value === o.v && s.chipOn]}>
          <Text style={[s.chipText, value === o.v && s.chipTextOn]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function SettingsScreen({ lang, settings, update, onAccountChanged }: { lang: Lang; settings: Settings; update: (p: Partial<Settings>) => void; onAccountChanged: () => void }) {
  const langs = LANGUAGES.map((l) => ({ v: l.code, label: l.native }));
  const d = dirStyle(lang);
  const email = useAccountEmail();
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState(false);
  const run = async (fn: () => Promise<unknown>) => {
    setAuthBusy(true);
    setAuthError(false);
    try { await fn(); onAccountChanged(); } catch { setAuthError(true); } finally { setAuthBusy(false); }
  };
  return (
    <ScrollView contentContainerStyle={s.list}>
      <Text style={[s.h1, d]}>{t(lang, "settings.title")}</Text>
      <Text style={[s.label, d]}>{t(lang, "settings.input_language")}</Text>
      <Chips<Lang | "auto"> value={settings.inputLanguage} options={[{ v: "auto", label: "Auto" }, ...langs]} onChange={(v) => update({ inputLanguage: v })} />
      <Text style={[s.label, d]}>{t(lang, "settings.reply_language")}</Text>
      <Chips<Lang | "same"> value={settings.replyLanguage} options={[{ v: "same", label: t(lang, "settings.same_as_input") }, ...langs]} onChange={(v) => update({ replyLanguage: v })} />
      <Text style={[s.label, d]}>{t(lang, "settings.reply_mode")}</Text>
      <Chips<"audio" | "text"> value={settings.replyMode} options={[{ v: "audio", label: t(lang, "settings.mode.audio") }, { v: "text", label: t(lang, "settings.mode.text") }]} onChange={(v) => update({ replyMode: v })} />
      {supabase && (
        <>
          <Text style={[s.label, d]}>{t(lang, "auth.account")}</Text>
          {email !== null ? (
            <View style={s.row}>
              <Text style={[s.body, d]}>{t(lang, "auth.signed_in_as", { email })}</Text>
              <Pressable onPress={() => run(signOut)} disabled={authBusy} accessibilityRole="button"><Text style={s.linkText}>{t(lang, "auth.sign_out")}</Text></Pressable>
            </View>
          ) : (
            <>
              <Text style={[s.body, d]}>{t(lang, "auth.why")}</Text>
              <Pressable onPress={() => run(signInWithGoogle)} disabled={authBusy} accessibilityRole="button" style={[s.chip, authBusy && { opacity: 0.5 }]}>
                <Text style={s.chipText}>{t(lang, "auth.google")}</Text>
              </Pressable>
            </>
          )}
          {authError && <Text style={[s.body, { color: C.warn }]}>{t(lang, "chat.error")}</Text>}
        </>
      )}
      <Text style={[s.small, d]}>{t(lang, "disclaimer")}</Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  list: { padding: 16, gap: 12 },
  h1: { ...F.bold, fontSize: 26, letterSpacing: -0.4, color: C.ink },
  label: { ...F.bold, marginTop: 8, color: C.ink, fontSize: 16 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderColor: C.rule, backgroundColor: C.sheet, borderRadius: 999, paddingHorizontal: 14, minHeight: 40, justifyContent: "center" },
  chipOn: { backgroundColor: C.primary, borderColor: C.primary },
  chipText: { ...F.medium, color: C.ink, fontSize: 16 },
  chipTextOn: { color: "#fff" },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12 },
  body: { ...F.regular, color: C.ink, fontSize: 15 },
  linkText: { ...F.medium, color: C.ink, fontSize: 15, textDecorationLine: "underline" },
  small: { ...F.regular, marginTop: 20, color: C.muted, fontSize: 13, lineHeight: 18 },
});
