import { useCallback, useEffect, useState } from "react";
import { Linking, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { claimLines, formatLine } from "../../../src/lib/claims/render";
import { money, t } from "../../../src/lib/i18n";
import { formatValue } from "../../../src/lib/i18n/format";
import { getRoadmap } from "../api";
import { C, card, dirStyle, F } from "../theme";
import type { Lang, Roadmap as RoadmapT, RoadmapItem } from "../types";

const statusColor = (s: string) => (s === "verified" || s === "calculated" ? C.ok : s === "needs_fact" ? C.muted : C.warn);

function Item({ item, lang }: { item: RoadmapItem; lang: Lang }) {
  const [open, setOpen] = useState(false);
  const d = dirStyle(lang);
  const label = item.kind === "obligation" ? "plan.status.applies" : item.kind === "info" && item.status === "eligible" ? "plan.status.info" : `plan.status.${item.status}`;
  return (
    <View style={s.item}>
      <Text style={[s.title, d]}>{t(lang, item.titleKey)}</Text>
      <Text style={[s.chip, item.status === "eligible" ? s.chipOn : s.chipOff]}>{t(lang, label)}</Text>
      <Text style={[s.muted, d]}>{t(lang, `reason.${item.reason}`)}</Text>
      <Text style={[s.body, d]}>{t(lang, item.actionKey)}</Text>
      {item.estimate && <Text style={s.marker}>{t(lang, "plan.up_to", { amount: money(lang, item.estimate.annualMax) })}</Text>}
      <View style={s.row}>
        <Text style={s.link} onPress={() => Linking.openURL(item.applyUrl)}>{t(lang, "plan.official")}</Text>
        <Text style={s.link} onPress={() => setOpen((o) => !o)}>{t(lang, "why.title")}</Text>
      </View>
      {open && (
        <View style={s.why}>
          {item.why.youToldMe.length > 0 && <Text style={s.whyHead}>{t(lang, "why.you_told_me")}</Text>}
          {item.why.youToldMe.map((f) => <Text key={f.key} style={[s.small, d]}>{t(lang, `label.${f.key}`)}: {formatValue(lang, f.key, f.value)}</Text>)}
          {item.why.derived.length > 0 && <Text style={s.whyHead}>{t(lang, "why.we_worked_out")}</Text>}
          {item.why.derived.flatMap((c) => claimLines(c).map((l) => (
            <Text key={c.id + l.key} style={[s.small, d]}>
              {c.kind === "assumption" ? `${t(lang, "why.assumption")}: ` : ""}{t(lang, l.key, formatLine(l, (n) => money(lang, n)))}
              {c.kind !== "assumption" && <Text style={{ color: statusColor(c.status) }}> ({t(lang, `status.${c.status}`)})</Text>}
            </Text>
          )))}
          {item.why.rules.some((c) => c.sources[0]?.quote) && <Text style={s.whyHead}>{t(lang, "why.rules")}</Text>}
          {item.why.rules.filter((c) => c.sources[0]?.quote).map((c) => (
            <Text key={c.id} style={s.small}>
              “{c.sources[0].quote}” <Text style={s.link} onPress={() => Linking.openURL(c.sources[0].url)}>{t(lang, "why.source")}</Text>
              <Text style={{ color: statusColor(c.status) }}> ({t(lang, `status.${c.status}`)})</Text>
            </Text>
          ))}
          {item.why.unknown.length > 0 && <Text style={[s.small, d]}>{t(lang, "why.unknown")}: {item.why.unknown.map((k) => t(lang, `label.${k}`)).join(", ")}</Text>}
        </View>
      )}
    </View>
  );
}

export function Roadmap({ lang, version }: { lang: Lang; version: number }) {
  const [data, setData] = useState<RoadmapT | null>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await getRoadmap()); } finally { setLoading(false); }
  }, []);
  // Background reload on version change: no spinner, so no synchronous setState in the effect.
  useEffect(() => {
    let live = true;
    getRoadmap().then((x) => { if (live) setData(x); }).catch(() => {});
    return () => { live = false; };
  }, [version]);
  const d = dirStyle(lang);
  return (
    <ScrollView contentContainerStyle={s.list} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
      <Text style={[s.h1, d]}>{t(lang, "roadmap.title")}</Text>
      {data && data.totalAnnualMax > 0 && (
        <View style={s.totalBox}>
          <Text style={[s.total, d]}>{t(lang, "plan.total", { amount: money(lang, data.totalAnnualMax) })}</Text>
          <Text style={[s.totalNote, d]}>{t(lang, "plan.total_note")}</Text>
        </View>
      )}
      {data && data.items.length === 0 && <Text style={[s.muted, d]}>{t(lang, "plan.empty")}</Text>}
      {[1, 2, 3, 4].map((tier) => {
        const items = data?.items.filter((i) => i.tier === tier) ?? [];
        if (!items.length) return null;
        return (
          <View key={tier} style={s.group}>
            <Text style={[s.tier, d]}>{t(lang, `roadmap.tier.${tier}`)}</Text>
            {items.map((i) => <Item key={i.programId} item={i} lang={lang} />)}
          </View>
        );
      })}
      {!!data?.needsFact.length && (
        <View style={s.group}>
          <Text style={[s.tier, d]}>{t(lang, "roadmap.needs_fact")}</Text>
          {data.needsFact.map((i) => (
            <Text key={i.programId} style={[s.small, d]}>{t(lang, i.titleKey)}: {i.why.unknown.map((k) => t(lang, `label.${k}`)).join(", ")}</Text>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  list: { padding: 16, gap: 14 },
  h1: { ...F.bold, fontSize: 26, letterSpacing: -0.4, color: C.ink },
  totalBox: { backgroundColor: C.tint, borderRadius: 18, padding: 16, gap: 6 },
  total: { ...F.bold, fontSize: 28, letterSpacing: -0.4, color: C.ink },
  totalNote: { ...F.regular, fontSize: 13, lineHeight: 18, color: "#334766" },
  group: { gap: 12 },
  tier: { ...F.bold, marginTop: 8, fontSize: 13, letterSpacing: 0.5, textTransform: "uppercase", color: C.muted },
  item: { ...card, gap: 8 },
  title: { ...F.bold, fontSize: 18, color: C.ink },
  chip: { ...F.bold, alignSelf: "flex-start", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, fontSize: 13, overflow: "hidden" },
  chipOn: { backgroundColor: C.primary, color: "#fff" },
  chipOff: { borderWidth: 1, borderColor: "#93c5fd", color: C.primary },
  body: { ...F.regular, fontSize: 16, color: C.ink, lineHeight: 23 },
  muted: { ...F.regular, fontSize: 15, lineHeight: 21, color: C.body },
  marker: { ...F.bold, alignSelf: "flex-start", backgroundColor: C.tint, color: C.navy, fontSize: 15, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, overflow: "hidden" },
  row: { flexDirection: "row", gap: 18 },
  link: { ...F.medium, color: C.primary, fontSize: 15 },
  why: { backgroundColor: C.tintSoft, borderRadius: 12, padding: 12, gap: 4 },
  whyHead: { ...F.bold, marginTop: 6, color: C.navy },
  small: { ...F.regular, fontSize: 14, color: C.ink, lineHeight: 20 },
});
