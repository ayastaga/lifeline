import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { t } from "../../../src/lib/i18n";
import { C, dirStyle, F } from "../theme";
import type { Citation, Lang } from "../types";
import { Icon } from "./Icon";

export type Msg = { id: string; role: "user" | "assistant"; text: string; citations?: Citation[]; audioUri?: string; error?: boolean };

/** The full conversation, sources and replay, in a sheet over the orb. */
export function HistorySheet({ open, onClose, messages, lang, onPlay }: { open: boolean; onClose: () => void; messages: Msg[]; lang: Lang; onPlay: (uri: string) => void }) {
  const d = dirStyle(lang);
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.scrim}>
        <Pressable style={s.flex} onPress={onClose} accessibilityLabel={t(lang, "talk.close")} />
        <View style={s.sheet}>
          <View style={s.grabber} />
          <View style={s.head}>
            <Text style={s.title}>{t(lang, "talk.conversation")}</Text>
            <Pressable onPress={onClose} style={s.iconBtn} accessibilityRole="button" accessibilityLabel={t(lang, "talk.close")}>
              <Icon name="close" size={18} color={C.ink} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={s.list}>
            {messages.length === 0 && <Text style={[s.muted, d]}>{t(lang, "talk.start")}</Text>}
            {messages.map((m) => m.role === "user" ? (
              <Text key={m.id} style={[s.user, d]}>{m.text}</Text>
            ) : (
              <View key={m.id} style={s.reply}>
                <Text style={[s.assistant, m.error && s.error, d]}>{m.text}</Text>
                {!!m.citations?.length && (
                  <View style={s.sources}>
                    <Text style={s.sourcesTitle}>{t(lang, "chat.sources")}</Text>
                    {m.citations.map((c) => (
                      <Text key={c.url} style={s.link} onPress={() => Linking.openURL(c.url)}>{c.title ?? new URL(c.url).hostname}</Text>
                    ))}
                  </View>
                )}
                {m.audioUri && (
                  <Pressable onPress={() => onPlay(m.audioUri!)} style={s.play} accessibilityRole="button">
                    <Icon name="play" size={14} color={C.primaryDark} />
                    <Text style={s.playText}>{t(lang, "talk.play")}</Text>
                  </Pressable>
                )}
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  scrim: { flex: 1, backgroundColor: C.scrim },
  sheet: { maxHeight: "78%", backgroundColor: C.sheet, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 10, paddingBottom: 32 },
  grabber: { alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: "#cbd5e1" },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 10 },
  title: { ...F.bold, fontSize: 20, color: C.ink },
  iconBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: C.rule, alignItems: "center", justifyContent: "center" },
  list: { paddingHorizontal: 20, paddingBottom: 12, gap: 16 },
  muted: { ...F.regular, color: C.muted, fontSize: 16 },
  user: { ...F.regular, alignSelf: "flex-end", maxWidth: "82%", backgroundColor: C.primary, color: "#fff", fontSize: 16, lineHeight: 22, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 18, borderBottomRightRadius: 4, overflow: "hidden" },
  reply: { gap: 10 },
  assistant: { ...F.regular, color: C.ink, fontSize: 16, lineHeight: 24 },
  error: { color: C.warn, backgroundColor: C.warnBg, borderRadius: 14, padding: 12, overflow: "hidden" },
  sources: { backgroundColor: C.tintSoft, borderRadius: 14, padding: 12, gap: 6 },
  sourcesTitle: { ...F.bold, fontSize: 13, color: C.navy },
  link: { ...F.medium, fontSize: 15, color: C.primary },
  play: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, minHeight: 36, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1, borderColor: C.tint, backgroundColor: C.tintSoft },
  playText: { ...F.medium, fontSize: 14, color: C.primaryDark },
});
