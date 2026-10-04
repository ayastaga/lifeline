import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible, Noto_Nastaliq_Urdu, Noto_Sans_Arabic, Noto_Sans_Devanagari, Noto_Sans_Gurmukhi, Noto_Sans_SC } from "next/font/google";
import "./globals.css";

const atkinson = Atkinson_Hyperlegible({ weight: ["400", "700"], subsets: ["latin", "latin-ext"], variable: "--font-atkinson", display: "swap" });
const deva = Noto_Sans_Devanagari({ subsets: ["devanagari"], weight: ["400", "700"], variable: "--font-deva", display: "swap", preload: false });
const guru = Noto_Sans_Gurmukhi({ subsets: ["gurmukhi"], weight: ["400", "700"], variable: "--font-guru", display: "swap", preload: false });
const arab = Noto_Sans_Arabic({ subsets: ["arabic"], weight: ["400", "700"], variable: "--font-arab", display: "swap", preload: false });
const nastaliq = Noto_Nastaliq_Urdu({ subsets: ["arabic"], weight: ["400", "700"], variable: "--font-nastaliq", display: "swap", preload: false });
const sc = Noto_Sans_SC({ weight: ["400", "700"], variable: "--font-sc", display: "swap", preload: false });

export const metadata: Metadata = {
  title: "Lifeline",
  description: "Benefits, credits and taxes in Ontario, explained from official sources, in 8 languages.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f6f7f4" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-CA" dir="ltr" className={[atkinson, deva, guru, arab, nastaliq, sc].map((f) => f.variable).join(" ")}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
