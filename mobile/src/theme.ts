import { isRtl, type Lang } from "../../src/lib/i18n/detect";

// White and royal blue. `tint` replaces the old marker yellow for money and pending facts.
export const C = {
  paper: "#f7faff",
  sheet: "#ffffff",
  ink: "#0f1e3d",
  body: "#42526e",
  muted: "#5b6b86",
  rule: "#e2e8f3",
  primary: "#2563eb",
  primaryDark: "#1d4ed8",
  navy: "#1e3a8a",
  tint: "#dbeafe",
  tintSoft: "#eff5ff",
  ok: "#1d7a4e",
  warn: "#8a4b00",
  warnBg: "#fff7eb",
  scrim: "rgba(15,30,61,0.35)",
};

// DM Sans covers Latin only; the OS falls back to its own font for other scripts.
export const F = {
  regular: { fontFamily: "DMSans_400Regular" },
  medium: { fontFamily: "DMSans_500Medium" },
  bold: { fontFamily: "DMSans_700Bold" },
} as const;

export const card = {
  backgroundColor: C.sheet,
  borderRadius: 18,
  padding: 16,
  shadowColor: C.ink,
  shadowOpacity: 0.06,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 2,
} as const;

export const dirStyle = (lang: Lang) =>
  isRtl(lang) ? ({ writingDirection: "rtl", textAlign: "right" } as const) : ({ writingDirection: "ltr", textAlign: "left" } as const);
