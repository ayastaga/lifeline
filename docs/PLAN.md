# Lifeline — Product Spec and Plan (v2)

Last updated: 2026-10-04. Supersedes `PLAN-v1.md` (kept for history).

## 1. What Lifeline is

Lifeline is a **source-verified financial navigator for people in Canada**. It learns the facts that matter about your situation, checks current government and institutional rules, works out what those rules mean for you, and gives you a prioritized roadmap of things you may be eligible for, should understand, or should do next. It never sells products or gives investment advice.

**Core promise:** help people discover important financial opportunities *before* they discover them too late (an RESP opened years late, an FHSA nobody mentioned, benefits never applied for).

**Who it's for:** anyone navigating money in Canada, in any situation and any of eight languages. Students, newcomers, refugees, parents and gig workers are facts that can be true about a person, not product tracks.

**Why it's different:** the information already exists (CRA, Canada.ca Benefits Finder, FCAC tools, newcomer financial-literacy programs), but it's fragmented. People have to know which department, product or acronym to ask about. Lifeline's job: *tell me your situation, and I'll work out which questions need answering.* AI budgeting apps and bank chatbots answer "talk to me about my money"; Lifeline answers "given who I am, what am I missing, and prove it."

## 2. Decisions

| Decision | Choice |
|---|---|
| Core | **Engine first, chat second.** Profile → relevant programs/accounts → missing facts → calculate → verify → explain → action. Chat and voice are how you talk to the engine. |
| Scope of questions | Any financial question. The line: no recommendations of specific investments, products, providers or allocations ("put $X here"). |
| What it does with numbers | Facts that depend on your numbers, and personal calculations from public rules (TFSA room, missed grants, guideline ranges with their source). Never allocation advice. |
| Verification | **Every claim verified.** Curated rules/facts first; live lookup with claim-level verification for everything else. Tier-4 sources can raise a question, never support a claim. |
| Neutrality | Neutral on every question, banks included. No advisor hand-off. |
| Region | Ontario + federal. |
| Personas | None. Life circumstances drive relevance. |
| Onboarding | A conversation that only asks for facts that can change the answer. Every fact confirmed before it counts. |
| Interaction | Speak or type; hear or read. Input language, reply language and reply mode are independent settings. |
| Voice architecture | Pipeline (speech-to-text → engine + verification → text-to-speech), so nothing is spoken before it's verified. A short "let me check that" pause is acceptable. |
| Languages | The architecture supports all 8 (EN, FR, ZH, HI, UR, PA, AR, ES). Voice ships language by language, chosen by testing with real speakers. |
| Client | Native iOS/Android (Expo / React Native). The Next.js project becomes the API; the web UI is secondary. |
| Code | Evolve v1. Rules engine, facts table, calculators, orchestrator, confirm-before-save, language detection and schema all carry over. |
| AI (text) | OpenAI flagship, pinned, temperature 0; Qwen via the same interface later. Re-evaluate against Gemini on the golden set. |
| AI (speech) | Per-language routing behind a `SpeechProvider` interface. Candidates: Sarvam (Hindi, Punjabi STT/TTS), general multilingual providers for ZH/AR/UR/FR/ES. Chosen by our own audio test set, not vendor benchmarks. |

## 3. Non-goals

- Investment, product, provider or allocation recommendations.
- Connecting users to advisors.
- Bank account aggregation, transaction analysis, net-worth tracking (crowded category, heavy privacy cost). The optional CSV upload from v1 stays as-is but isn't extended.
- Filing taxes. Provinces other than Ontario.

## 4. Trust architecture

### 4.1 Three kinds of knowledge, kept separate

| Kind | Example | Origin |
|---|---|---|
| **User fact** | "I became a resident in 2024." | The person, confirmed by them. Stored with source (typed / spoken / statement / inferred) and confirmation time. |
| **Verified rule or fact** | "TFSA room starts accumulating in the year you become a resident." / "The TFSA limit for 2026 is $X." | Facts table or a live source, with tax year and jurisdiction. |
| **Derived fact** | "Your TFSA room started accumulating in 2024." | Code combining user facts with verified rules. Never the model. |

### 4.2 Claims are objects

An answer is assembled from claims, not free text.

```ts
type Claim = {
  id: string;
  text: string;                       // language-neutral template, rendered per language
  kind: "fact" | "calculation" | "eligibility" | "action";
  sources: {
    url: string; tier: 1 | 2 | 3; title: string;
    location: string;                 // heading or quoted span on the page
    retrievedAt: string; contentHash: string;
  }[];
  appliesTo: { taxYear?: number; effectiveFrom?: string; effectiveUntil?: string; jurisdiction: "CA" | "ON" };
  dependsOn: { userFacts: string[]; facts: string[]; calculator?: string };
  status: "verified" | "calculated" | "needs_fact" | "unverified" | "conflict" | "may_have_changed";
};
```

No confidence percentages are shown to users; the status words are the interface.

### 4.3 Statuses

- **Verified:** supported by a tier 1–3 source retrieved for this answer or in the facts table.
- **Calculated from verified rules:** output of a calculator whose inputs are all verified or confirmed.
- **Needs one more fact:** the engine knows which fact; onboarding asks for it.
- **Could not verify:** shown as "I couldn't confirm this" plus the best official link, or omitted.
- **Source conflict:** two sources disagree. **Lifeline doesn't pick one**; it says it found conflicting information and leaves the item out of the plan.
- **May have changed:** the source changed since it was verified, or the fact's tax year is over.

### 4.4 Source tiers

1. **Authoritative:** CRA, Canada.ca, ESDC, FCAC, Government of Ontario, OSC and other regulators.
2. **Primary institutional:** a bank's, credit union's or insurer's own documentation, for facts about that institution only.
3. **Reputable secondary:** professional associations, established nonprofits (e.g. Prosper Canada).
4. **Discovery only:** search snippets, blogs, forums, generic finance sites. Can prompt a lookup; **cannot support a claim.**

Tier 1 beats tiers 2–3 for rules. A tier-2 page contradicting tier 1 on a rule is a conflict, not an override.

### 4.5 Verification pipeline (live lookup)

1. The model proposes what to look up (it can't answer from memory).
2. Search, then fetch only allowlisted tier 1–3 domains; store page text, hash and retrieval time.
3. Extract candidate claims, each tied to a quoted span of the fetched page.
4. **Verifier pass:** a separate check confirms the span actually supports the claim (fully, partly, or not), that numbers and dates match exactly, and that the tax year applies.
5. Claims that fail, or partly fail, are dropped or downgraded; conflicts are flagged.
6. The model writes the reply **from verified claims only**, in the user's language; the v1 number check still runs as a final guard.

### 4.6 Freshness

Every fact and source carries `effectiveFrom`, `effectiveUntil`, `lastVerifiedAt`, `sourceUrl`, `sourceTier`, `jurisdiction`, and a review trigger (`annual`, `tax_year_change`, `on_page_change`). A scheduled re-crawl compares content hashes; changed pages mark dependent claims `may_have_changed` and put them in a review queue. The model never "remembers" a limit; the facts table knows which year each number belongs to.

## 5. Profile and onboarding

- The conversation opens with "Tell me about yourself and your situation", in the chosen language.
- After each answer, the engine computes which missing facts would unblock or change the most roadmap items, and asks for that next ("I'll only ask for things that can change what I tell you").
- Extracted facts appear on the profile card as pending; the person confirms or corrects them.
- **Spoken numbers are read back** before saving ("You became a resident in 2024, is that right?"), because a misheard year silently corrupts every calculation that depends on it.
- Contradictory facts ("arrived 2024" and "filed taxes here in 2022") are surfaced and asked about, never resolved silently.

## 6. Roadmap

- Items come from the engine: programs, accounts, obligations, deadlines.
- **Ordered by tier, not a score:** (1) deadline-driven or unlocks other benefits (e.g. filing a return); (2) value lost every year you wait (RESP grants, CLB); (3) one-time setup with room that accumulates (TFSA, FHSA); (4) ongoing habits (emergency savings, credit building). Within a tier: higher verified value first.
- Every item has **"Why am I seeing this?"**: the user facts it depends on, the verified rules it uses, what's still unknown, sources, and the next action ("check your exact room in CRA My Account").
- Estimates remain "up to" amounts from verified facts, labelled as maximums.

## 7. Voice and language

```
speech ──► speech-to-text ──► text + detected language
                                     │
                                     ▼
                 engine + tools + verification (language-neutral claims)
                                     │
                                     ▼
          reply written directly in the chosen language ──► text-to-speech ──► speech
```

- The voice layer only transports the conversation. It can't answer, add or change anything.
- `SpeechProvider` interface with routing by language (STT and TTS chosen separately), mirroring `ai/provider.ts`.
- Replies are written in the target language, not translated from English; natural code-mixing (e.g. Hinglish) is allowed.
- Spoken replies say claims and point to sources on screen; they don't read URLs aloud.
- While tools run: a short spoken filler ("let me check that"), then the verified answer.

## 8. Clients and services

- `apps/mobile`: Expo app with conversation (voice + text), profile card, roadmap, "why am I seeing this", and settings for input/output language and mode.
- `apps/api`: the current Next.js project, serving JSON/streaming endpoints; existing web UI kept as a secondary client.
- Shared package: types, zod schemas, i18n strings.
- Supabase: anonymous accounts by default, optional email/phone sign-in to keep a profile across devices; RLS as in v1.

## 9. Build order

### Milestone 1: verified vertical slice (the demo) — built 2026-10-04, acceptance pending

> Someone asks a money question by voice in Punjabi or Hindi. Lifeline works out what it needs to know, asks for it, answers using only verified rules and facts, shows where every claim came from, explains why it applies to them, and says the answer back in their language.

- Domain: TFSA, FHSA, RESP + CESG + Canada Learning Bond, plus the v1 benefits already built (CCB, Ontario Child Benefit, CGEB, OTB, first tax return).
- Claim objects and statuses on top of the existing facts table and rules engine; user / derived / verified separation.
- New facts (tier 1, with tax years): TFSA annual limits by year, FHSA annual and lifetime limits, RESP carry-forward rules.
- New calculators: TFSA room since residency, FHSA room, RESP grants missed and recoverable.
- "Why am I seeing this?" on roadmap items.
- Information-value onboarding with read-back.
- Voice end to end in English + one South Asian language, picked by testing.
- Minimal Expo app.
- **Acceptance:** golden tests (text and recorded audio) pass; at least two real speakers of the chosen language complete the demo flow unaided.

### Milestone 2: live lookup with claim verification
Search + fetch for tier 1–3 domains, claim extraction tied to quoted spans, verifier pass, conflict detection, freshness fields and change detection.

### Milestone 3: breadth
RRSP and Home Buyers' Plan, RDSP, CPP/OAS/GIS, EI, more student and housing programs, credit building, consumer and banking rights, fraud warnings, bank facts from tier-2 sources. Voice for the remaining languages as each passes its audio tests.

### Milestone 4: production hardening
Optional sign-in, scheduled re-crawl and review queue, verify gate enforced in CI, deployment, native-speaker review of all eight languages.

## 10. Testing

- **Unit:** rules, calculators, claim assembly, status transitions, freshness.
- **Golden text set:** the v1 42 cases, extended per milestone.
- **Golden audio set:** recorded questions per language from real speakers, with accents and background noise. Metrics: errors on the facts that matter (years, ages, amounts), not just overall word error rate; native-speaker ratings of reply naturalness.
- **Verification failure cases** (each must produce the right status, not a confident answer):
  correct answer + wrong source · outdated source · conflicting government sources · bank contradicting government · snippet contradicting the page · source doesn't support the claim · source supports only part of it · calculation using an outdated fact · contradictory user facts · ambiguous residency date · missing spouse or child information · unknown income · source unavailable · page changed between retrieval and verification.

## 11. Carried over from v1

Rules engine and 20 program files · facts table (41 entries, all still awaiting human verification) · calculators · tool-calling orchestrator · composer number check, citations, refusals · confirm-before-save with pending facts · language and script detection · 8-language UI strings · Supabase schema with RLS · ingest pipeline · 58 tests and 42 golden questions.

## 12. Open items

- **Milestone 1 acceptance:** run the golden text set with a key; record the audio set and compare OpenAI vs Sarvam for Hindi and Punjabi; run the mobile app on a device; two real speakers complete the demo flow unaided.

- Pick the first South Asian voice language by testing with real speakers.
- Choose STT/TTS vendors per language from our own audio set.
- Human verification of all v1 programs and facts before any public use.
- canada.ca blocks datacenter IPs; ingest and live lookup need an allowed network path (or a cache refreshed from one).
