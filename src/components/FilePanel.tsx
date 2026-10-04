"use client";

import { useState } from "react";
import { date, hasKey, money, t } from "@/lib/i18n";
import { formatValue } from "@/lib/i18n/format";
import { parseChildren, type Question } from "@/lib/profile/onboarding";
import { Province } from "@/lib/profile/schema";
import type { Lang, ProfileSnapshot, RoadmapData } from "./shared";
import type { Claim } from "@/lib/claims";
import { claimLines, formatLine } from "@/lib/claims/render";
import type { RoadmapItem } from "@/lib/roadmap";

type Props = {
  lang: Lang;
  profile: ProfileSnapshot;
  roadmap: RoadmapData | null;
  skipped: string[];
  onSkip: (key: string) => void;
  onStage: (facts: { key: string; value: unknown }[]) => Promise<unknown>;
  onConfirm: (keys: string[]) => Promise<unknown>;
  onReject: (keys: string[]) => Promise<unknown>;
  onClear: (keys: string[]) => Promise<unknown>;
  onUploaded: () => Promise<void>;
  onReset: () => Promise<void>;
};

/** A string that fell back to English renders as English, LTR, so punctuation stays put in RTL pages. */
function Tx({ lang, k, as: Tag = "span", className }: { lang: Lang; k: string; as?: "span" | "p"; className?: string }) {
  const fallback = lang !== "en" && !hasKey(lang, k);
  return <Tag className={className} {...(fallback ? { lang: "en", dir: "ltr" } : {})}>{t(lang, k)}</Tag>;
}

// ---------------------------------------------------------------- profile card

function ProfileCard({ lang, profile, onConfirm, onReject, onClear }: Pick<Props, "lang" | "profile" | "onConfirm" | "onReject" | "onClear">) {
  const confirmed = Object.entries(profile.confirmed).filter(([k]) => k !== "language" && k !== "script");
  const pending = profile.pending;
  const empty = confirmed.length === 0 && pending.length === 0;
  const [showSaved, setShowSaved] = useState(false);
  const collapse = confirmed.length > 4 && !showSaved;
  return (
    <section aria-labelledby="profile-h">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="profile-h" className="text-xl font-bold">{t(lang, "profile.title")}</h2>
        {pending.length > 1 && (
          <button onClick={() => onConfirm(pending.map((p) => p.key))} className="rounded-lg bg-ink px-3 py-1.5 text-sm font-bold text-paper">
            {t(lang, "profile.confirm_all")}
          </button>
        )}
      </div>
      {empty && <p className="mt-2 text-muted">{t(lang, "profile.empty")}</p>}
      {pending.length > 0 && <p className="mt-2 text-sm text-muted">{t(lang, "profile.pending")}</p>}
      <dl className="mt-2 divide-y divide-rule border-y border-rule">
        {pending.map((p) => (
          <div key={`p-${p.key}`} className="grid grid-cols-[minmax(0,10rem)_1fr] gap-x-4 gap-y-1 py-2.5">
            <dt className="text-muted">{t(lang, `label.${p.key}`)}</dt>
            <dd className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="marker font-bold">{formatValue(lang, p.key, p.value)}</span>
              {p.source !== "user" && <span className="text-sm text-muted">{t(lang, p.source === "statement" ? "profile.source.statement" : "profile.source.inferred")}</span>}
              <span className="ms-auto flex gap-2 text-sm">
                <button onClick={() => onConfirm([p.key])} className="rounded-md border border-ink px-2.5 py-1 font-bold">{t(lang, "profile.confirm")}</button>
                <button onClick={() => onReject([p.key])} className="rounded-md px-2 py-1 text-muted underline-offset-4 hover:underline">{t(lang, "profile.reject")}</button>
              </span>
            </dd>
          </div>
        ))}
        {!collapse && confirmed.map(([k, v]) => (
          <div key={`c-${k}`} className="grid grid-cols-[minmax(0,10rem)_1fr] gap-x-4 py-2.5">
            <dt className="text-muted">{t(lang, `label.${k}`)}</dt>
            <dd className="flex items-center gap-3">
              <span>{formatValue(lang, k, v)}</span>
              <span className="ms-auto text-ok" aria-hidden>✓</span>
              <button onClick={() => onClear([k])} className="text-sm text-muted underline-offset-4 hover:underline">{t(lang, "profile.edit")}</button>
            </dd>
          </div>
        ))}
      </dl>
      {confirmed.length > 4 && (
        <button onClick={() => setShowSaved((x) => !x)} aria-expanded={showSaved} className="mt-2 text-sm text-muted underline underline-offset-4">
          {showSaved ? t(lang, "profile.hide_saved") : t(lang, "profile.show_saved", { n: confirmed.length })}
        </button>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- onboarding

function Onboarding({ lang, profile, question, onSkip, onStage, onConfirm }: Pick<Props, "lang" | "profile" | "onSkip" | "onStage" | "onConfirm"> & { question: Question | null }) {
  // The server ranks unknown facts by how much they'd change the roadmap; we ask the top one.
  const q = question;
  const [picked, setPicked] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [why, setWhy] = useState(false);
  const [err, setErr] = useState(false);

  const answer = async (value: unknown) => {
    if (!q) return;
    setErr(false);
    await onStage([{ key: q.key, value }]);
    setPicked([]); setText(""); setWhy(false);
  };

  if (!q) {
    return (
      <section className="rounded-xl border border-rule bg-sheet p-4">
        {profile.pending.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p>{t(lang, "onboard.review")}</p>
            <button onClick={() => onConfirm(profile.pending.map((p) => p.key))} className="rounded-lg bg-ink px-3 py-1.5 font-bold text-paper">{t(lang, "profile.confirm_all")}</button>
          </div>
        ) : (
          <p>{t(lang, "onboard.done")}</p>
        )}
      </section>
    );
  }

  const btn = "rounded-lg border border-ink bg-sheet px-3.5 py-2 text-start hover:bg-ink hover:text-paper";
  return (
    <section aria-labelledby="q-h" className="rounded-xl border border-rule bg-sheet p-4">
      <p className="text-sm text-muted">{t(lang, "onboard.title")}</p>
      <h3 id="q-h" className="mt-1 text-lg font-bold">{t(lang, `q.${q.key}`)}</h3>

      <div className="mt-3 flex flex-wrap gap-2">
        {q.input === "personas" && (
          <>
            {q.options.map((o) => (
              <button
                key={o}
                aria-pressed={picked.includes(o)}
                onClick={() => setPicked((p) => (p.includes(o) ? p.filter((x) => x !== o) : [...p, o]))}
                className={`${btn} ${picked.includes(o) ? "bg-ink text-paper" : ""}`}
              >
                {t(lang, `opt.${o}`)}
              </button>
            ))}
            <button disabled={!picked.length} onClick={() => answer(picked)} className="rounded-lg bg-ink px-4 py-2 font-bold text-paper disabled:opacity-40">{t(lang, "onboard.next")}</button>
          </>
        )}

        {q.input === "boolean" && (["true", "false"] as const).map((o) => (
          <button key={o} className={btn} onClick={() => answer(o === "true")}>{t(lang, `opt.${o}`)}</button>
        ))}

        {q.input === "enum" && q.key === "province" && (
          <>
            <button className={btn} onClick={() => answer("ON")}>{t(lang, "opt.ON")}</button>
            <select aria-label={t(lang, "opt.other_province")} defaultValue="" onChange={(e) => e.target.value && answer(e.target.value)} className="rounded-lg border border-rule bg-sheet px-3 py-2">
              <option value="" disabled>{t(lang, "opt.other_province")}</option>
              {Province.options.filter((p) => p !== "ON").map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </>
        )}

        {q.input === "enum" && q.key !== "province" && q.options.map((o) => (
          <button key={o} className={btn} onClick={() => answer(o)}>{t(lang, q.key === "housing" && o === "other" ? "opt.other_housing" : `opt.${o}`)}</button>
        ))}

        {(q.input === "number" || q.input === "children") && (
          <form
            className="flex w-full flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (q.input === "children") {
                const kids = parseChildren(text);
                if (!kids || kids.length === 0) return setErr(true);
                answer(kids);
              } else {
                const n = Number(text.trim());
                if (!Number.isInteger(n)) return setErr(true);
                answer(n);
              }
            }}
          >
            <input
              inputMode={q.input === "number" ? "numeric" : "text"}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t(lang, q.input === "children" ? "onboard.children_hint" : "onboard.number_hint")}
              aria-invalid={err}
              className={`min-w-0 flex-1 rounded-lg border bg-paper px-3 py-2 ${err ? "border-warn" : "border-rule"}`}
            />
            <button className="rounded-lg bg-ink px-4 py-2 font-bold text-paper">{t(lang, "onboard.next")}</button>
            {q.input === "children" && <button type="button" className={btn} onClick={() => answer([])}>{t(lang, "onboard.no_children")}</button>}
          </form>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-4 text-sm text-muted">
        <button onClick={() => onSkip(q.key)} className="underline underline-offset-4">{t(lang, "onboard.skip")}</button>
        {q.sensitive && <button onClick={() => setWhy((w) => !w)} aria-expanded={why} className="underline underline-offset-4">{t(lang, "onboard.why")}</button>}
      </div>
      {why && <p className="mt-2 max-w-[60ch] text-sm">{t(lang, "onboard.why_body")}</p>}
    </section>
  );
}

// ---------------------------------------------------------------- roadmap

const STATUS_STYLE: Record<string, string> = {
  verified: "text-ok", calculated: "text-ok", needs_fact: "text-muted", unverified: "text-warn", conflict: "text-warn", may_have_changed: "text-warn",
};
function CalcLine({ lang, c }: { lang: Lang; c: Claim }) {
  return (
    <>
      {claimLines(c).map((l) => {
        const fallback = lang !== "en" && !hasKey(lang, l.key);
        return (
          <li key={l.key} {...(fallback ? { lang: "en", dir: "ltr" } : {})}>
            {c.kind === "assumption" && <span className="text-muted">{t(lang, "why.assumption")}: </span>}
            {t(lang, l.key, formatLine(l, (n) => money(lang, n)))}
            {c.kind !== "assumption" && <> <span className={`text-sm ${STATUS_STYLE[c.status]}`}>({t(lang, `status.${c.status}`)})</span></>}
          </li>
        );
      })}
    </>
  );
}

function Why({ lang, item }: { lang: Lang; item: RoadmapItem }) {
  const { why } = item;
  return (
    <details className="mt-2 text-sm">
      <summary className="cursor-pointer text-muted underline underline-offset-4">{t(lang, "why.title")}</summary>
      <div className="mt-2 space-y-3 border-s-[3px] border-rule ps-3">
        {why.youToldMe.length > 0 && (
          <div><p className="font-bold">{t(lang, "why.you_told_me")}</p>
            <ul className="mt-1">{why.youToldMe.map((f) => <li key={f.key}>{t(lang, `label.${f.key}`)}: {formatValue(lang, f.key, f.value)}</li>)}</ul></div>
        )}
        {why.derived.length > 0 && (
          <div><p className="font-bold">{t(lang, "why.we_worked_out")}</p><ul className="mt-1 space-y-1">{why.derived.map((c) => <CalcLine key={c.id} lang={lang} c={c} />)}</ul></div>
        )}
        {why.rules.filter((c) => c.sources[0]?.quote).length > 0 && (
          <div><p className="font-bold">{t(lang, "why.rules")}</p>
            <ul className="mt-1 space-y-2">{why.rules.filter((c) => c.sources[0]?.quote).map((c) => (
              <li key={c.id}>
                <span className="text-muted">{t(lang, "why.quote")}: </span>
                <q lang="en" dir="ltr">{c.sources[0].quote}</q>{" "}
                <a href={c.sources[0].url} target="_blank" rel="noreferrer" className="underline decoration-rule underline-offset-4">{t(lang, "why.source")}</a>{" "}
                <span className={STATUS_STYLE[c.status]}>({t(lang, `status.${c.status}`)})</span>
              </li>))}</ul></div>
        )}
        {why.unknown.length > 0 && <p><span className="font-bold">{t(lang, "why.unknown")}: </span>{why.unknown.map((k) => t(lang, `label.${k}`)).join(", ")}</p>}
      </div>
    </details>
  );
}

function RoadmapView({ lang, roadmap }: { lang: Lang; roadmap: RoadmapData | null }) {
  const [showNot, setShowNot] = useState(false);
  if (!roadmap) return null;
  const statusLabel = (i: RoadmapItem) => {
    if ((i.status === "eligible" || i.status === "likely") && i.kind === "obligation") return t(lang, "plan.status.applies");
    if (i.status === "eligible" && i.kind === "info") return t(lang, "plan.status.info");
    return t(lang, `plan.status.${i.status}`);
  };
  const chip = (s: string) => (s === "eligible" ? "bg-ok text-white" : s === "likely" ? "border border-ok text-ok" : "border border-rule text-muted");
  const Item = ({ i }: { i: RoadmapItem }) => (
    <li className="py-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h4 className="font-bold">{t(lang, i.titleKey)}</h4>
        <span className={`rounded-full px-2.5 py-0.5 text-sm ${chip(i.status)}`}>{statusLabel(i)}</span>
      </div>
      {i.reason !== "missing_profile_facts" && <Tx lang={lang} k={`reason.${i.reason}`} as="p" className="mt-1 block text-muted" />}
      {i.status !== "need_more_info" && <Tx lang={lang} k={i.actionKey} as="p" className="mt-1 block" />}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        {i.estimate && (
          <span>
            <span className="marker font-bold">{t(lang, "plan.up_to", { amount: money(lang, i.estimate.annualMax) })}</span>
            {i.estimate.conditional && <span className="text-muted"> ({t(lang, i.estimate.basis === "clb_first_year" ? "plan.first_year" : "plan.if_contribute")})</span>}
          </span>
        )}
        {i.deadline && i.status !== "need_more_info" && <span>{t(lang, "plan.deadline", { date: date(lang, i.deadline.date) })}</span>}
        <a href={i.applyUrl} target="_blank" rel="noreferrer" className="underline decoration-rule underline-offset-4 hover:decoration-ink">{t(lang, "plan.official")}</a>
      </div>
      <Why lang={lang} item={i} />
    </li>
  );
  const tiers = [1, 2, 3, 4].map((tier) => ({ tier, items: roadmap.items.filter((i) => i.tier === tier) })).filter((g) => g.items.length);
  const anything = roadmap.items.length > 0;

  return (
    <section aria-labelledby="plan-h">
      <h2 id="plan-h" className="text-xl font-bold">{t(lang, "roadmap.title")}</h2>
      {!anything ? <p className="mt-2 text-muted">{t(lang, "plan.empty")}</p> : (
        <>
          {roadmap.totalAnnualMax > 0 && (
            <div className="mt-3">
              <p key={roadmap.totalAnnualMax} className="text-[2.25rem] font-bold leading-tight">
                <span className="marker marker-draw">{t(lang, "plan.total", { amount: money(lang, roadmap.totalAnnualMax) })}</span>
              </p>
              <p className="mt-1 max-w-[60ch] text-sm text-muted">{t(lang, "plan.total_note")}</p>
              {roadmap.items.some((i) => !i.verified) && <p className="mt-1 text-sm text-warn">{t(lang, "plan.unverified")}</p>}
            </div>
          )}
          {tiers.map((g) => (
            <div key={g.tier} className="mt-5">
              <h3 className="text-sm text-muted">{t(lang, `roadmap.tier.${g.tier}`)}</h3>
              <ul className="divide-y divide-rule">{g.items.map((i) => <Item key={i.programId} i={i} />)}</ul>
            </div>
          ))}
        </>
      )}
      {roadmap.needsFact.length > 0 && (
        <div className="mt-5">
          <h3 className="text-sm text-muted">{t(lang, "roadmap.needs_fact")}</h3>
          <ul className="mt-1 space-y-1 text-sm">{roadmap.needsFact.map((i) => (
            <li key={i.programId}><span className="font-bold">{t(lang, i.titleKey)}</span>: {i.why.unknown.map((k) => t(lang, `label.${k}`)).join(", ")}</li>
          ))}</ul>
        </div>
      )}
      {roadmap.notForYou.length > 0 && (
        <>
          <button onClick={() => setShowNot((s) => !s)} aria-expanded={showNot} className="mt-3 text-sm text-muted underline underline-offset-4">
            {t(lang, showNot ? "plan.hide_not" : "plan.show_not")} ({roadmap.notForYou.length})
          </button>
          {showNot && <ul className="divide-y divide-rule opacity-80">{roadmap.notForYou.map((i) => <Item key={i.programId} i={i} />)}</ul>}
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- upload

function Upload({ lang, onUploaded }: { lang: Lang; onUploaded: () => Promise<void> }) {
  const [state, setState] = useState<{ count?: number; hints?: { code: string }[]; error?: boolean; busy?: boolean }>({});
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setState({ busy: true });
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const json = await res.json();
    if (!res.ok) return setState({ error: true });
    setState({ count: json.count, hints: json.hints });
    await onUploaded();
  };
  return (
    <section aria-labelledby="upload-h" className="text-sm">
      <h2 id="upload-h" className="font-bold">{t(lang, "upload.title")}</h2>
      <p className="mt-1 max-w-[60ch] text-muted">{t(lang, "upload.body")}</p>
      <label className="mt-2 inline-block cursor-pointer rounded-lg border border-ink px-3 py-1.5 font-bold">
        {t(lang, "upload.button")}
        <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} disabled={state.busy} />
      </label>
      {state.error && <p className="mt-2 text-warn">{t(lang, "upload.error")}</p>}
      {state.count !== undefined && (
        <div className="mt-2">
          <p>{t(lang, "upload.done", { n: state.count })}</p>
          <ul className="mt-1 list-disc ps-5">{state.hints?.map((h) => <li key={h.code}>{t(lang, `hint.${h.code}`)}</li>)}</ul>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- panel

export function FilePanel(props: Props) {
  return (
    <div className="space-y-8 px-5 py-6 md:px-8">
      <ProfileCard {...props} />
      <Onboarding {...props} question={props.roadmap?.nextQuestions?.[0] ?? null} />
      <RoadmapView lang={props.lang} roadmap={props.roadmap} />
      <div className="border-t border-rule pt-6">
        <Upload lang={props.lang} onUploaded={props.onUploaded} />
      </div>
      <button onClick={props.onReset} className="text-sm text-muted underline underline-offset-4">{t(props.lang, "reset")}</button>
    </div>
  );
}
