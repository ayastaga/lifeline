import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
  useAudioSampleListener,
} from "expo-audio";
import { File, Paths } from "expo-file-system";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { t } from "../../../src/lib/i18n";
import { filler, sendText, sendVoice } from "../api";
import { HistorySheet, type Msg } from "../components/HistorySheet";
import { Icon } from "../components/Icon";
import { Orb, type OrbMode } from "../components/Orb";
import { C, dirStyle, F } from "../theme";
import type { Lang, Settings } from "../types";

const HINT_KEY = "lifeline.talkHintSeen";
const RECORDING = { ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true };

function writeAudio(base64: string, name: string): string {
  const file = new File(Paths.cache, name);
  file.write(base64, { encoding: "base64" });
  return file.uri;
}

/** Mic metering in dBFS (about -60 quiet to 0 loud) to 0–1. */
const meterLevel = (db: number) => Math.max(0, Math.min(1, (db + 50) / 45));

type Props = { settings: Settings; onProfileChanged: () => void; historyOpen: boolean; setHistoryOpen: (open: boolean) => void };

export function Talk({ settings, onProfileChanged, historyOpen, setHistoryOpen }: Props) {
  const ui: Lang = settings.replyLanguage !== "same" ? settings.replyLanguage : settings.inputLanguage !== "auto" ? settings.inputLanguage : "en";
  const d = dirStyle(ui);
  const { width } = useWindowDimensions();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const [hintSeen, setHintSeen] = useState(true);
  const recorder = useAudioRecorder(RECORDING);
  const recorderState = useAudioRecorderState(recorder, 80);
  const player = useAudioPlayer(null);
  const playerStatus = useAudioPlayerStatus(player);
  const fillers = useRef(new Map<Lang, string>());
  const starting = useRef<Promise<void> | null>(null);
  const origin = useRef({ x: 0, y: 0 });
  const cancelRef = useRef(false);
  const level = useSharedValue(0);

  useEffect(() => {
    (async () => {
      await AudioModule.requestRecordingPermissionsAsync();
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
    })();
    AsyncStorage.getItem(HINT_KEY).then((v) => setHintSeen(v === "1"));
  }, []);

  // Live levels drive the orb: mic metering while recording, the reply's waveform while speaking.
  useEffect(() => {
    if (recording && recorderState.metering != null) level.set(meterLevel(recorderState.metering));
  }, [recording, recorderState.metering, level]);
  useAudioSampleListener(player, (sample) => {
    const frames = sample.channels[0]?.frames;
    if (!frames?.length) return;
    let sum = 0;
    for (const f of frames) sum += f * f;
    level.set(Math.min(1, Math.sqrt(sum / frames.length) * 3));
  });
  useEffect(() => { if (!playerStatus.playing && !recording) level.set(0); }, [playerStatus.playing, recording, level]);

  useEffect(() => {
    if (!cancelled) return;
    const id = setTimeout(() => setCancelled(false), 2000);
    return () => clearTimeout(id);
  }, [cancelled]);

  const play = (uri: string) => { player.replace({ uri }); player.play(); };

  // "Let me check that." while tools run: a fixed phrase, cached per language.
  const playFiller = async (lang: Lang) => {
    if (settings.replyMode !== "audio") return;
    try {
      let uri = fillers.current.get(lang);
      if (!uri) {
        const f = await filler(lang);
        uri = writeAudio(f.audio.base64, `filler-${lang}.mp3`);
        fillers.current.set(lang, uri);
      }
      play(uri);
    } catch { /* filler is optional */ }
  };

  const push = (m: Msg) => setMessages((all) => [...all, m]);

  const startRecording = () => {
    if (busy || starting.current) return;
    cancelRef.current = false;
    setCancelling(false);
    setCancelled(false);
    if (!hintSeen) { setHintSeen(true); AsyncStorage.setItem(HINT_KEY, "1"); }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    player.pause();
    setRecording(true);
    starting.current = recorder.prepareToRecordAsync().then(() => recorder.record());
  };

  // Release sends; sliding off the orb first (or the system taking the touch) cancels.
  const finishRecording = async (send: boolean) => {
    const started = starting.current;
    if (!started) return;
    starting.current = null;
    setRecording(false);
    setCancelling(false);
    level.set(0);
    try {
      await started;
      await recorder.stop();
    } catch {
      return;
    }
    if (!send) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setCancelled(true);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const uri = recorder.uri;
    if (!uri) return;
    setBusy(true);
    const replyLang = settings.replyLanguage !== "same" ? settings.replyLanguage : settings.inputLanguage !== "auto" ? settings.inputLanguage : undefined;
    playFiller(replyLang ?? ui);
    try {
      const r = await sendVoice(uri, {
        inputLanguage: settings.inputLanguage !== "auto" ? settings.inputLanguage : undefined,
        replyLanguage: settings.replyLanguage !== "same" ? settings.replyLanguage : undefined,
        replyMode: settings.replyMode,
      });
      push({ id: `u${Date.now()}`, role: "user", text: r.transcript });
      const audioUri = r.audio ? writeAudio(r.audio.base64, `reply-${Date.now()}.mp3`) : undefined;
      push({ id: `a${Date.now()}`, role: "assistant", text: r.text, citations: r.citations, audioUri });
      if (audioUri) play(audioUri);
      if (r.pendingKeys.length) onProfileChanged();
    } catch {
      push({ id: `e${Date.now()}`, role: "assistant", text: t(ui, "chat.error"), error: true });
    } finally {
      setBusy(false);
    }
  };

  const sendTyped = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    push({ id: `u${Date.now()}`, role: "user", text });
    setBusy(true);
    try {
      const r = await sendText(text, settings.replyLanguage !== "same" ? settings.replyLanguage : undefined);
      push({ id: `a${Date.now()}`, role: "assistant", text: r.text, citations: r.citations });
      if (r.pendingKeys.length) onProfileChanged();
    } catch {
      push({ id: `e${Date.now()}`, role: "assistant", text: t(ui, "chat.error"), error: true });
    } finally {
      setBusy(false);
    }
  };

  const mode: OrbMode = recording ? "listening" : busy ? "thinking" : playerStatus.playing ? "speaking" : "idle";
  const status =
    cancelling ? t(ui, "talk.release_cancel")
    : mode === "listening" ? t(ui, "talk.listening")
    : mode === "thinking" ? t(ui, "chat.working")
    : mode === "speaking" ? t(ui, "talk.speaking")
    : cancelled ? t(ui, "talk.cancelled")
    : t(ui, "talk.hold");
  const last = [...messages].reverse().find((m) => m.role === "assistant");
  const caption = mode === "listening" ? "" : mode === "thinking" ? t(ui, "voice.checking") : last?.text ?? t(ui, "talk.start");
  const sourceCount = last?.citations?.length ?? 0;
  const orbSize = Math.min(width * (typing ? 0.42 : 0.65), 300);

  // Gentle bounce on the first-run hint until the orb has been held once.
  const bob = useSharedValue(0);
  useEffect(() => {
    bob.set(withRepeat(withSequence(withTiming(-6, { duration: 900 }), withTiming(0, { duration: 900 })), -1));
  }, [bob]);
  const bobStyle = useAnimatedStyle(() => ({ transform: [{ translateY: bob.get() }] }));

  return (
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={s.stage}>
        <View
          accessible
          accessibilityRole="button"
          accessibilityLabel={t(ui, "talk.hold")}
          accessibilityHint={t(ui, "talk.hint")}
          accessibilityState={{ disabled: busy || typing }}
          onStartShouldSetResponder={() => !busy && !typing}
          onResponderTerminationRequest={() => false}
          onResponderGrant={(e) => {
            origin.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
            startRecording();
          }}
          onResponderMove={(e) => {
            const away = Math.hypot(e.nativeEvent.pageX - origin.current.x, e.nativeEvent.pageY - origin.current.y) > orbSize * 0.6;
            if (away !== cancelRef.current) {
              cancelRef.current = away;
              setCancelling(away);
              Haptics.selectionAsync();
            }
          }}
          onResponderRelease={() => finishRecording(!cancelRef.current)}
          onResponderTerminate={() => finishRecording(false)}
        >
          <Orb mode={mode} level={level} size={orbSize} dimmed={cancelling} />
        </View>

        <Text style={[s.status, cancelling && { color: C.warn }]} accessibilityLiveRegion="polite">{status}</Text>

        <Pressable onPress={() => messages.length && setHistoryOpen(true)} disabled={!messages.length} style={s.captionBox}>
          {!!caption && <Text style={[s.caption, last?.error && mode === "idle" && { color: C.warn }, { textAlign: "center", writingDirection: d.writingDirection }]} numberOfLines={4}>{caption}</Text>}
          {mode === "idle" && messages.length > 0 && (
            <View style={s.linkRow}>
              <Icon name="book" size={16} color={C.primary} />
              <Text style={s.linkText}>{sourceCount ? `${t(ui, "chat.sources")} · ${sourceCount}` : t(ui, "talk.see_conversation")}</Text>
            </View>
          )}
        </Pressable>
      </View>

      <View style={s.bottom}>
        {typing ? (
          <>
            <View style={s.inputBar}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                onSubmitEditing={sendTyped}
                placeholder={t(ui, "chat.placeholder")}
                placeholderTextColor={C.muted}
                style={[s.input, d]}
                returnKeyType="send"
                autoFocus
              />
              <Pressable onPress={sendTyped} disabled={busy || !draft.trim()} style={[s.send, (busy || !draft.trim()) && { opacity: 0.4 }]} accessibilityRole="button" accessibilityLabel={t(ui, "chat.send")}>
                <Icon name="send" size={20} color="#fff" strokeWidth={2.2} />
              </Pressable>
            </View>
            <Pressable onPress={() => setTyping(false)} style={s.toggle} accessibilityRole="button">
              <Icon name="mic" size={16} color={C.primary} />
              <Text style={s.linkText}>{t(ui, "talk.talk_instead")}</Text>
            </Pressable>
          </>
        ) : (
          <>
            {!hintSeen && mode === "idle" && (
              <Animated.View style={[s.hint, bobStyle]}>
                <Text style={[s.hintText, d]}>{t(ui, "talk.hint")}</Text>
              </Animated.View>
            )}
            <Pressable onPress={() => setTyping(true)} style={s.toggle} accessibilityRole="button">
              <Icon name="keyboard" size={16} color={C.primary} />
              <Text style={s.linkText}>{t(ui, "talk.type_instead")}</Text>
            </Pressable>
          </>
        )}
      </View>

      <HistorySheet open={historyOpen} onClose={() => setHistoryOpen(false)} messages={messages} lang={ui} onPlay={play} />
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  stage: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  status: { ...F.medium, fontSize: 14, letterSpacing: 0.6, textTransform: "uppercase", color: C.primary, marginTop: -8 },
  captionBox: { alignItems: "center", gap: 6, marginTop: 14, minHeight: 120, maxWidth: 340 },
  caption: { ...F.medium, fontSize: 20, lineHeight: 28, color: C.ink },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44 },
  linkText: { ...F.medium, fontSize: 15, color: C.primary },
  bottom: { paddingHorizontal: 20, paddingBottom: 12, alignItems: "center", gap: 6, minHeight: 96, justifyContent: "flex-end" },
  hint: { backgroundColor: C.ink, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 9, maxWidth: 340 },
  hintText: { ...F.medium, color: "#fff", fontSize: 14, textAlign: "center" },
  toggle: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, paddingHorizontal: 8 },
  inputBar: {
    flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "stretch",
    backgroundColor: C.sheet, borderWidth: 1, borderColor: C.rule, borderRadius: 28, paddingLeft: 18, paddingRight: 6, paddingVertical: 6,
    shadowColor: C.ink, shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 3,
  },
  input: { ...F.regular, flex: 1, minHeight: 44, fontSize: 16, color: C.ink },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.primary, alignItems: "center", justifyContent: "center" },
});
