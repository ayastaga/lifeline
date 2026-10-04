import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { t } from "../../../src/lib/i18n";
import { formatValue } from "../../../src/lib/i18n/format";
import { getProfile, profileAction } from "../api";
import { C, card, dirStyle, F } from "../theme";
import type { Lang, ProfileSnapshot } from "../types";

// Nothing counts until confirmed here. Spoken facts were already read back in the conversation.
export function Profile({ lang, version, onChanged }: { lang: Lang; version: number; onChanged: () => void }) {
  const [p, setP] = useState<ProfileSnapshot | null>(null);
  useEffect(() => {
    let live = true; // ignore a response that lands after unmount or a newer version
    getProfile().then((x) => { if (live) setP(x); }).catch(() => {});
    return () => { live = false; };
  }, [version]);
  const act = async (body: object) => { setP(await profileAction(body)); onChanged(); };
  const d = dirStyle(lang);
  if (!p) return null;
  const confirmed = Object.entries(p.confirmed);
  return (
    <ScrollView contentContainerStyle={s.list}>
      <Text style={[s.h1, d]}>{t(lang, "profile.title")}</Text>
      {confirmed.length === 0 && p.pending.length === 0 && <Text style={[s.muted, d]}>{t(lang, "profile.empty")}</Text>}
      {p.pending.length > 0 && (
        <>
          <Text style={[s.muted, d]}>{t(lang, "profile.pending")}</Text>
          {p.pending.length > 1 && (
            <Pressable style={s.primary} onPress={() => act({ action: "confirm", keys: p.pending.map((x) => x.key) })}><Text style={s.primaryText}>{t(lang, "profile.confirm_all")}</Text></Pressable>
          )}
          {p.pending.map((f) => (
            <View key={f.key} style={s.row}>
              <View style={s.flex}>
                <Text style={[s.label, d]}>{t(lang, `label.${f.key}`)}</Text>
                <Text style={[s.pending, d]}>{formatValue(lang, f.key, f.value)}</Text>
              </View>
              <Pressable style={s.outline} onPress={() => act({ action: "confirm", keys: [f.key] })}><Text style={s.outlineText}>{t(lang, "profile.confirm")}</Text></Pressable>
              <Text style={s.link} onPress={() => act({ action: "reject", keys: [f.key] })}>{t(lang, "profile.reject")}</Text>
            </View>
          ))}
        </>
      )}
      {confirmed.map(([k, v]) => (
        <View key={k} style={s.row}>
          <View style={s.flex}>
            <Text style={[s.label, d]}>{t(lang, `label.${k}`)}</Text>
            <Text style={[s.value, d]}>{formatValue(lang, k, v)} <Text style={{ color: C.ok }}>✓</Text></Text>
          </View>
          <Text style={s.link} onPress={() => act({ action: "clear", keys: [k] })}>{t(lang, "profile.edit")}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  list: { padding: 16, gap: 12 },
  flex: { flex: 1 },
  h1: { ...F.bold, fontSize: 26, letterSpacing: -0.4, color: C.ink },
  muted: { ...F.regular, color: C.body, fontSize: 15 },
  row: { ...card, flexDirection: "row", alignItems: "center", gap: 12 },
  label: { ...F.regular, color: C.muted, fontSize: 14 },
  value: { ...F.medium, color: C.ink, fontSize: 17 },
  pending: { ...F.bold, color: C.navy, fontSize: 17, backgroundColor: C.tint, alignSelf: "flex-start", borderRadius: 6, paddingHorizontal: 6, overflow: "hidden" },
  primary: { backgroundColor: C.primary, borderRadius: 14, minHeight: 48, alignItems: "center", justifyContent: "center" },
  primaryText: { ...F.bold, color: "#fff", fontSize: 16 },
  outline: { borderWidth: 1, borderColor: C.primary, borderRadius: 10, paddingHorizontal: 12, minHeight: 40, justifyContent: "center" },
  outlineText: { ...F.bold, color: C.primary },
  link: { ...F.medium, color: C.muted },
});
