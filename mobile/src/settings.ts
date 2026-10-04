import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import type { Lang, Settings } from "./types";

const KEY = "lifeline.settings";
const DEFAULTS: Settings = { inputLanguage: "auto", replyLanguage: "same", replyMode: "audio" };

/** Input language, reply language and reply mode are independent settings. */
export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => v && setSettings({ ...DEFAULTS, ...JSON.parse(v) }));
  }, []);
  const update = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    AsyncStorage.setItem(KEY, JSON.stringify(next));
  };
  return { settings, update };
}

/** Language the interface is shown in: the reply language if set, else the input language, else English. */
export function uiLanguage(s: Settings): Lang {
  if (s.replyLanguage !== "same") return s.replyLanguage;
  if (s.inputLanguage !== "auto") return s.inputLanguage;
  return "en";
}
