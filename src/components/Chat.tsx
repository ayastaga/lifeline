"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { t } from "@/lib/i18n";
import { scriptClass, textDir, type ChatMsg, type Lang } from "./shared";

/** Minimal, safe renderer: paragraphs, "- " / "1. " lists, **bold**. No HTML. */
function Rich({ text }: { text: string }) {
  const inline = (s: string): ReactNode[] =>
    s.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : part));
  const blocks = text.split(/\n{2,}/);
  return (
    <>
      {blocks.map((block, bi) => {
        const lines = block.split("\n").filter((l) => l.trim());
        const bullets = lines.every((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l));
        if (bullets && lines.length > 0) {
          const ordered = /^\s*\d/.test(lines[0]);
          const Tag = ordered ? "ol" : "ul";
          return (
            <Tag key={bi} className={`my-2 space-y-1 ps-6 ${ordered ? "list-decimal" : "list-disc"}`}>
              {lines.map((l, li) => <li key={li}>{inline(l.replace(/^\s*([-*•]|\d+[.)])\s+/, ""))}</li>)}
            </Tag>
          );
        }
        return <p key={bi} className="my-2 first:mt-0 last:mb-0">{lines.flatMap((l, li) => (li ? [<br key={`b${li}`} />, ...inline(l)] : inline(l)))}</p>;
      })}
    </>
  );
}

function hostAndPath(url: string) {
  try {
    const u = new URL(url);
    return { host: u.hostname.replace(/^www\./, ""), path: u.pathname.split("/").filter(Boolean).pop()?.replace(/\.html$/, "").replace(/-/g, " ") ?? "" };
  } catch {
    return { host: url, path: "" };
  }
}

export function Chat(props: {
  lang: Lang;
  messages: ChatMsg[];
  busy: boolean;
  activeTool: string | null;
  onSend: (text: string) => void;
  onFeedback: (m: ChatMsg, kind: "thumbs_up" | "thumbs_down") => void;
}) {
  const { lang, messages, busy, activeTool } = props;
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages.length, busy]);

  const submit = () => {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    props.onSend(text);
  };

  return (
    <div className="flex h-full min-h-[60dvh] flex-col">
      <div className="flex-1 overflow-y-auto px-5 py-6 md:px-8" aria-live="polite">
        {messages.length === 0 && (
          <div className="max-w-[60ch] pt-4">
            <h1 className="text-[1.75rem] font-bold leading-tight">{t(lang, "chat.empty.title")}</h1>
            <p className="mt-3 text-muted">{t(lang, "chat.empty.body")}</p>
          </div>
        )}
        <ol className="space-y-6">
          {messages.map((m) => (
            <li key={m.id} className={m.role === "user" ? "flex justify-end" : ""}>
              {m.role === "user" ? (
                <div dir={textDir(m.text)} className={`max-w-[85%] rounded-2xl rounded-ee-sm bg-ink px-4 py-2.5 text-paper ${scriptClass(m.text)}`}>{m.text}</div>
              ) : (
                <article className="max-w-[62ch]">
                  <div dir={textDir(m.text)} className={`${m.error ? "text-warn" : ""} ${scriptClass(m.text)}`}>
                    <Rich text={m.text} />
                  </div>
                  {!!m.replaced && <p className="mt-2 text-sm text-muted">{t(lang, "chat.checked")}</p>}
                  {!!m.citations?.length && (
                    <div className="mt-3 border-s-[3px] border-rule ps-3">
                      <p className="text-sm font-bold">{t(lang, "chat.sources")}</p>
                      <ul className="mt-1 space-y-1 text-sm">
                        {m.citations.map((c) => {
                          const { host, path } = hostAndPath(c.url);
                          return (
                            <li key={c.url}>
                              <a href={c.url} target="_blank" rel="noreferrer" className="underline decoration-rule underline-offset-4 hover:decoration-ink" dir="ltr">
                                {c.title ?? path}
                              </a>
                              <span className="text-muted"> ({host})</span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                  {!m.error && (
                    <div className="mt-2 flex gap-3 text-sm text-muted">
                      {m.feedback ? (
                        <span>{t(lang, "chat.thanks")}</span>
                      ) : (
                        <>
                          <button className="underline-offset-4 hover:underline" onClick={() => props.onFeedback(m, "thumbs_up")}>{t(lang, "chat.helpful")}</button>
                          <button className="underline-offset-4 hover:underline" onClick={() => props.onFeedback(m, "thumbs_down")}>{t(lang, "chat.not_helpful")}</button>
                        </>
                      )}
                    </div>
                  )}
                </article>
              )}
            </li>
          ))}
          {busy && (
            <li className="flex items-center gap-3 text-muted" role="status">
              <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-ink" aria-hidden />
              {activeTool ? t(lang, `chat.tool.${activeTool}`) : t(lang, "chat.working")}
            </li>
          )}
        </ol>
        <div ref={endRef} />
      </div>

      <form
        className="sticky bottom-0 flex gap-2 border-t border-rule bg-paper px-5 py-4 md:px-8"
        onSubmit={(e) => { e.preventDefault(); submit(); }}
      >
        <label className="sr-only" htmlFor="chat-input">{t(lang, "chat.placeholder")}</label>
        <textarea
          id="chat-input"
          dir="auto"
          rows={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); } }}
          placeholder={t(lang, "chat.placeholder")}
          className={`max-h-40 min-h-12 flex-1 resize-none rounded-xl border border-rule bg-sheet px-4 py-3 ${scriptClass(draft)}`}
        />
        <button type="submit" disabled={busy || !draft.trim()} className="rounded-xl bg-ink px-5 font-bold text-paper disabled:opacity-40">
          {t(lang, "chat.send")}
        </button>
      </form>
    </div>
  );
}
