import { DMSans_400Regular, DMSans_500Medium, DMSans_700Bold, useFonts } from "@expo-google-fonts/dm-sans";
import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { t } from "../src/lib/i18n";
import { Icon, type IconName } from "./src/components/Icon";
import { Profile } from "./src/screens/Profile";
import { Roadmap } from "./src/screens/Roadmap";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { Talk } from "./src/screens/Talk";
import { uiLanguage, useSettings } from "./src/settings";
import { C, F } from "./src/theme";

type Tab = "talk" | "roadmap" | "profile" | "settings";

export default function App() {
  const [fontsLoaded] = useFonts({ DMSans_400Regular, DMSans_500Medium, DMSans_700Bold });
  const { settings, update } = useSettings();
  const [tab, setTab] = useState<Tab>("talk");
  const [version, setVersion] = useState(0); // bump to refresh roadmap/profile after facts change
  const [badge, setBadge] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const lang = uiLanguage(settings);
  const changed = () => { setVersion((v) => v + 1); setBadge(true); };
  const tabs: { k: Tab; label: string; icon: IconName }[] = [
    { k: "talk", label: t(lang, "nav.chat"), icon: "mic" },
    { k: "roadmap", label: t(lang, "roadmap.title"), icon: "map" },
    { k: "profile", label: t(lang, "profile.title"), icon: "user" },
    { k: "settings", label: t(lang, "settings.title"), icon: "settings" },
  ];
  if (!fontsLoaded) return <View style={s.root} />;
  return (
    <SafeAreaProvider>
    <SafeAreaView style={s.root}>
      <StatusBar style="dark" />
      <View style={s.header}>
        <View style={s.brandRow}>
          <View style={s.logo}><Icon name="pulse" size={20} color="#fff" strokeWidth={2.2} /></View>
          <Text style={s.brand}>Lifeline</Text>
        </View>
        {tab === "talk" && (
          <Pressable onPress={() => setHistoryOpen(true)} style={s.iconBtn} accessibilityRole="button" accessibilityLabel={t(lang, "talk.conversation")}>
            <Icon name="history" size={20} color={C.ink} />
          </Pressable>
        )}
      </View>
      <View style={s.flex}>
        {/* Talk stays mounted so the conversation survives tab switches. */}
        <View style={[s.flex, tab !== "talk" && s.hidden]}>
          <Talk settings={settings} onProfileChanged={changed} historyOpen={historyOpen} setHistoryOpen={setHistoryOpen} />
        </View>
        {tab === "roadmap" && <Roadmap lang={lang} version={version} />}
        {tab === "profile" && <Profile lang={lang} version={version} onChanged={() => setVersion((v) => v + 1)} />}
        {tab === "settings" && <SettingsScreen lang={lang} settings={settings} update={update} onAccountChanged={() => setVersion((v) => v + 1)} />}
      </View>
      <View style={s.tabs} accessibilityRole="tablist">
        {tabs.map((x) => {
          const on = tab === x.k;
          return (
            <Pressable key={x.k} onPress={() => { setTab(x.k); if (x.k === "profile") setBadge(false); }} style={s.tab} accessibilityRole="tab" accessibilityState={{ selected: on }}>
              <View style={[s.pill, on && s.pillOn]}>
                <Icon name={x.icon} size={20} color={on ? C.primaryDark : C.muted} />
                {x.k === "profile" && badge && <View style={s.badge} />}
              </View>
              <Text style={[s.tabText, on && s.tabOn]} numberOfLines={1}>{x.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.paper },
  flex: { flex: 1 },
  hidden: { display: "none" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 6 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  logo: { width: 34, height: 34, borderRadius: 10, backgroundColor: C.primary, alignItems: "center", justifyContent: "center" },
  brand: { ...F.bold, fontSize: 21, letterSpacing: -0.3, color: C.ink },
  iconBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: C.rule, backgroundColor: C.sheet, alignItems: "center", justifyContent: "center" },
  tabs: { flexDirection: "row", borderTopWidth: 1, borderTopColor: C.rule, backgroundColor: C.sheet, paddingTop: 6, paddingHorizontal: 8 },
  tab: { flex: 1, paddingVertical: 6, alignItems: "center", gap: 4 },
  pill: { width: 56, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center" },
  pillOn: { backgroundColor: C.tint },
  badge: { position: "absolute", top: 4, right: 14, width: 8, height: 8, borderRadius: 4, backgroundColor: C.primary },
  tabText: { ...F.regular, color: C.muted, fontSize: 12 },
  tabOn: { ...F.bold, color: C.ink },
});
