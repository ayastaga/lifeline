"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isRtl, LANGUAGES, t } from "@/lib/i18n";
import { Chat } from "./Chat";
import { FilePanel } from "./FilePanel";
import type { ChatMsg, Lang, ProfileSnapshot, RoadmapData } from "./shared";

export function LifelineApp() {
  const [lang, setLang] = useState<Lang>("en");
  const [profile, setProfile] = useState<ProfileSnapshot | null>(null);
  const [roadmap, setRoadmap] = useState<RoadmapData | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [busy, setBusy] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [tab, setTab] = useState<"chat" | "file">("chat");
  const [skipped, setSkipped] = useState<string[]>([]);
  const [fileBadge, setFileBadge] = useState(false);
  const [account, setAccount] = useState<{ configured: boolean; email: string | null } | null>(null);
  const skippedRef = useRef(skipped);
  skippedRef.current = skipped;

  const applySnapshot = useCallback((snap: ProfileSnapshot) => {
    setProfile(snap);
    setLang((cur) => (snap.language && snap.language !== cur ? snap.language : cur));
  }, []);

  const refresh = useCallback(async () => {
    // Sequential on purpose: the first call may create the anonymous session.
    const p = await fetch("/api/profile").then((r) => r.json());
    applySnapshot(p);
    setRoadmap(await fetch(`/api/roadmap?skip=${skippedRef.current.join(",")}`).then((r) => r.json()));
    setAccount(await fetch("/api/auth/me").then((r) => r.json()).catch(() => null));
  }, [applySnapshot]);

  const signOut = async () => {
    await fetch("/api/auth/signout", { method: "POST" });
    setMessages([]);
    await refresh();
  };

  useEffect(() => { refresh(); }, [refresh]);

  // html lang/dir follow the UI language so screen readers and RTL work.
  useEffect(() => {
    const meta = LANGUAGES.find((l) => l.code === lang)!;
    document.documentElement.lang = meta.htmlLang;
    document.documentElement.dir = isRtl(lang) ? "rtl" : "ltr";
  }, [lang]);

  const post = useCallback(async (body: object) => {
    const res = await fetch("/api/profile", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const snap = await res.json();
    if (snap.confirmed) applySnapshot(snap);
    setRoadmap(await fetch(`/api/roadmap?skip=${skippedRef.current.join(",")}`).then((r) => r.json()));
    return snap;
  }, [applySnapshot]);

  const chooseLanguage = async (l: Lang) => {
    setLang(l);
    await post({ action: "language", language: l });
  };

  const send = async (text: string) => {
    const id = crypto.randomUUID();
    setMessages((m) => [...m, { id: `u-${id}`, role: "user", text }]);
    setBusy(true);
    setActiveTool(null);
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: text }) });
      if (!res.ok || !res.body) throw new Error("bad_response");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let finalSeen = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const e = JSON.parse(line);
          if (e.type === "tool") setActiveTool(e.name);
          if (e.type === "error") throw new Error(e.message);
          if (e.type === "final") {
            finalSeen = true;
            setMessages((m) => [...m, { id: `a-${id}`, role: "assistant", text: e.text, citations: e.citations, refused: e.refused, replaced: e.replacedSentences, messageId: e.messageId }]);
            if (e.pendingKeys?.length) {
              setFileBadge(true);
              await refresh();
            }
          }
        }
      }
      if (!finalSeen) throw new Error("no_final");
    } catch {
      setMessages((m) => [...m, { id: `e-${id}`, role: "assistant", text: t(lang, "chat.error"), error: true }]);
    } finally {
      setBusy(false);
      setActiveTool(null);
    }
  };

  const feedback = async (msg: ChatMsg, kind: "thumbs_up" | "thumbs_down") => {
    setMessages((m) => m.map((x) => (x.id === msg.id ? { ...x, feedback: kind } : x)));
    await fetch("/api/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messageId: msg.messageId ?? null, kind }) });
  };

  const reset = async () => {
    if (!profile) return;
    const confirmed = Object.keys(profile.confirmed);
    const pending = profile.pending.map((p) => p.key);
    if (pending.length) await post({ action: "reject", keys: pending });
    if (confirmed.length) await post({ action: "clear", keys: confirmed });
    setSkipped([]);
    setMessages([]);
  };

  const pendingCount = profile?.pending.length ?? 0;

  return (
    <div className="mx-auto flex min-h-dvh max-w-[1280px] flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-rule px-5 py-4 md:px-8">
        <div className="flex items-baseline gap-3">
          <span className="text-2xl font-bold tracking-tight">Lifeline</span>
          <span className="hidden text-sm text-muted lg:inline">{t(lang, "app.tagline")}</span>
        </div>
        <div className="flex flex-wrap items-center gap-4">
        {account?.configured && (account.email ? (
          <span className="flex items-center gap-2 text-sm">
            <span className="text-muted">{t(lang, "auth.signed_in_as", { email: account.email })}</span>
            <button onClick={signOut} className="underline">{t(lang, "auth.sign_out")}</button>
          </span>
        ) : (
          <a href="/api/auth/google" className="rounded-md border border-rule bg-sheet px-3 py-1.5 text-sm">{t(lang, "auth.google")}</a>
        ))}
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted">{t(lang, "lang.label")}</span>
          <select
            value={lang}
            onChange={(e) => chooseLanguage(e.target.value as Lang)}
            className="rounded-md border border-rule bg-sheet px-2 py-1.5 text-base"
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code} lang={l.htmlLang}>{l.native}</option>
            ))}
          </select>
        </label>
        </div>
      </header>

      {/* Mobile tabs */}
      <nav className="flex border-b border-rule md:hidden" role="tablist">
        {(["chat", "file"] as const).map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => { setTab(k); if (k === "file") setFileBadge(false); }}
            className={`flex-1 py-3 text-base ${tab === k ? "border-b-[3px] border-ink font-bold" : "text-muted"}`}
          >
            {t(lang, k === "chat" ? "nav.chat" : "nav.file")}
            {k === "file" && (fileBadge || pendingCount > 0) && <span className="marker ms-2 rounded-sm px-1.5 text-sm text-ink">{pendingCount || "•"}</span>}
          </button>
        ))}
      </nav>

      <main className="grid flex-1 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <section className={`${tab === "chat" ? "flex" : "hidden"} min-h-0 flex-col md:sticky md:top-0 md:flex md:h-dvh md:self-start md:border-e md:border-rule`} aria-label={t(lang, "nav.chat")}>
          <Chat lang={lang} messages={messages} busy={busy} activeTool={activeTool} onSend={send} onFeedback={feedback} />
        </section>
        <section className={`${tab === "file" ? "block" : "hidden"} md:block`} aria-label={t(lang, "nav.file")}>
          {profile && (
            <FilePanel
              lang={lang}
              profile={profile}
              roadmap={roadmap}
              skipped={skipped}
              onSkip={(k) => { skippedRef.current = [...skippedRef.current, k]; setSkipped(skippedRef.current); refresh(); }}
              onStage={(facts) => post({ action: "stage", facts })}
              onConfirm={(keys) => post({ action: "confirm", keys })}
              onReject={(keys) => post({ action: "reject", keys })}
              onClear={(keys) => post({ action: "clear", keys })}
              onUploaded={refresh}
              onReset={reset}
            />
          )}
        </section>
      </main>

      <footer className="border-t border-rule px-5 py-4 text-sm text-muted md:px-8">{t(lang, "disclaimer")}</footer>
    </div>
  );
}
