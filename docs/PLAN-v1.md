# Lifeline — Detailed Plan

Last updated: 2026-10-03

## 1. Decisions (settled)

| Decision | Choice | Why |
|---|---|---|
| Stack | Next.js + Supabase, all TypeScript | One language, fast to ship; Supabase gives auth + Postgres + RLS + pgvector |
| AI layer | OpenAI first (pinned model, temp 0), Qwen3 later via the same OpenAI-compatible client | Best tool calling to build against; swap to open weights for the privacy story |
| Situations (v1) | Students, Newcomers, Families with kids, Gig / self-employed | Four personas, each with 3–5 programs |
| Region (v1) | Ontario + federal | Keeps the rules set small and verifiable |
| Languages | EN, FR, ZH (Mandarin, Simplified), HI, UR, PA (Gurmukhi + Shahmukhi), AR, ES | UI strings translated; model handles conversation |
| Bank data | CSV upload only, optional, week 3 | No aggregator integration in v1 |
| Core rule | Model routes + explains only; rules/facts/calculators produce every number | Accuracy, and the interview story |

## 2. Scope

### In v1
- Chat onboarding that fills a structured profile (buttons + free text, live profile card, confirm-before-save).
- Rules engine over ~16 programs (§5) producing eligible / likely / not eligible / need more info, each with a reason.
- Facts table of key numbers with effective year, source URL, last-checked date.
- RAG over a curated allowlist of canada.ca / CRA / ontario.ca pages; hybrid search; code-attached citations.
- Calculators: RESP grant (CESG) on a contribution, HST small-supplier check, simple tax set-aside estimate for gig income.
- Plan view: "Your plan" with items, deadlines, estimated money on the table, official links.
- Optional CSV statement upload -> transaction classifier -> situation hints the user confirms.
- 8-language UI (RTL for AR/UR); model replies in the user's language; same-script replies for Punjabi.
- Golden-question tests in CI (~30 in English, 3–4 per other language).

### Out of v1
Investment advice, filing taxes, live bank connections, Quebec-specific rules, speech input, household sharing (v2), advisor dashboard (stretch for a bank demo).

## 3. Architecture

### 3.1 Data flow
1. Any input (form chat, free chat, CSV) produces **candidate facts**.
2. Candidate facts are validated against `ProfileSchema` (zod) and shown to the user to confirm.
3. Confirmed facts live in `profile_facts` with `source` (user | inferred | statement) and `confirmed_at`.
4. The orchestrator receives: user message, confirmed profile, conversation history, available tools.
5. It calls tools. Tools are pure functions over the profile / facts / documents and return JSON.
6. The composer writes the reply in the user's language from tool results only; code then attaches citations (URLs from tool results) and runs claim checks.

### 3.2 Orchestrator routing (examples)
| Question type | Tool(s) |
|---|---|
| "What can I get?" / "Am I eligible for X?" | `check_eligibility` (rules engine) |
| "What is the limit / threshold / rate?" | `lookup_fact` |
| "How does X work?" | `search_docs` |
| "If I put $2,000 in an RESP..." | `calculate` + `lookup_fact` |
| "I'm a student in Ontario" (statement about self) | `update_profile` (then confirm) |
| "What did I spend on food?" | `query_transactions` (only if CSV uploaded) |
| Investment / product recommendations | refuse politely, offer official resources |

### 3.3 Accuracy mechanisms
- **Facts table is the only source of numbers.** The system prompt forbids stating any number not returned by a tool.
- **Claim check:** composer output is split into sentences; each sentence containing a number or program name must map to a tool result or retrieved chunk, else it is replaced by "see the official page" + link.
- **Abstain:** if the top retrieval score is below a threshold, answer "I'm not sure" + the best official link.
- **Freshness:** weekly re-crawl; changed pages flagged in an admin list; facts carry `last_checked`.
- **Golden questions** run in CI against the full pipeline with a fixed model and temperature 0.

### 3.4 Multilingual
- One multilingual model handles orchestration + composition end to end.
- Tools are language-neutral (codes, numbers, URLs).
- Cross-lingual retrieval: multilingual embeddings (BGE-M3) index EN/FR source text; queries in any language match directly. Fallback: translate the query to EN, retrieve, compose in the user's language.
- Language + script detection per message (language id library for language; Unicode block check for Gurmukhi vs Shahmukhi vs Latin/romanized). Reply in the detected script.
- UI strings in `src/lib/i18n/{lang}.json`; `dir="rtl"` for AR/UR.

### 3.5 Security & privacy
- Supabase Auth; RLS on every user table (`auth.uid() = user_id`).
- CSV statements parsed server-side; transactions stored per user with RLS; raw file deleted after parse.
- The model provider never receives raw transactions, only derived hints ("rent payments detected").
- Every answer carries the disclaimer; no personal data in logs.

## 4. Data model (see `supabase/migrations/0001_init.sql`)
- `profiles` — one row per user: preferred language, script, province.
- `profile_facts` — key/value facts with source + confirmation.
- `programs` — program metadata (name, level, jurisdiction, apply URL) + JSON rules.
- `facts` — key numbers: `key`, `value`, `unit`, `effective_year`, `source_url`, `last_checked`.
- `sources`, `documents`, `chunks` — RAG corpus with embeddings and metadata.
- `transactions` — parsed CSV rows per user (optional).
- `conversations`, `messages`, `tool_calls` — chat history for debugging and feedback.
- `feedback` — thumbs up/down + "did you apply?" follow-ups.

## 5. Programs for v1 (Ontario + federal)

Values are deliberately NOT in this plan. Every threshold goes in the facts table with a source URL after you verify it on the official page. Each program file has `"verify": true` until that is done.

| Persona | Programs |
|---|---|
| All | Canada Groceries and Essentials Benefit (formerly GST/HST credit, renamed 2026-07-03, id `gst_hst_credit`); Ontario Trillium Benefit (energy & property tax credit, sales tax credit); Canada Workers Benefit |
| Students | Tuition tax credit (T2202); OSAP overview; Canada Training Credit (verify age rules); interest on student loans credit |
| Newcomers | CGEB for newcomers (RC151 path); Canada Child Benefit for newcomers (RC66); first tax return requirement; SIN / credit-building guidance (informational) |
| Families | Canada Child Benefit; Ontario Child Benefit; RESP + Canada Education Savings Grant; Canada Learning Bond; child care expense deduction; Canadian Dental Care Plan (verify current eligibility) |
| Gig / self-employed | GST/HST registration (small supplier threshold); CPP contributions on self-employment income; business-use-of-home and vehicle expenses (informational); tax instalments; EI special benefits for self-employed (verify) |

## 6. Three-week build plan

### Week 1 — Foundations (data + rules)
- Day 1: scaffold Next.js, Supabase local, migrations, auth, RLS. Commit `ProfileSchema`.
- Day 2: facts table seed (verify ~20 numbers against official pages; record URLs and dates).
- Day 3: rules engine (`evaluate(profile) -> results[]`) + 6 programs with unit tests.
- Day 4: remaining ~10 programs; plan generator (results -> plan items with deadlines).
- Day 5: calculators (CESG, HST small supplier, gig tax set-aside) + tests.
- Weekend: curate `sources.json` allowlist (~40 pages).

### Week 2 — AI layer
- Day 6: provider interface (`ai/provider.ts`) with Anthropic + OpenAI implementations; streaming chat route.
- Day 7: tools (`ai/tools.ts`) wired to rules/facts/calculators; system prompt with the "no numbers from memory" rule.
- Day 8: ingest pipeline: fetch -> clean -> chunk (by heading, ~500 tokens) -> embed -> store; hybrid search (pgvector + tsvector) + rerank.
- Day 9: composer + citation attachment + claim check + abstain path.
- Day 10: golden-question harness in Vitest (English first).

### Week 3 — Product
- Day 11: chat onboarding (buttons, live profile card, confirm-before-save, skip, "why do you ask?").
- Day 12: plan view + money-on-the-table estimate + deadlines.
- Day 13: i18n for 8 languages, RTL, script detection, golden questions in each language.
- Day 14: CSV upload -> transaction classifier (rules + model fallback) -> situation hints.
- Day 15: polish, README diagram, 90-second demo video, deploy (Vercel + Supabase cloud).

### Phase 2 (after v1)
- Qwen3 provider via vLLM (OpenAI-compatible endpoint), same interface; compare on golden questions.
- Household sharing (two users, one plan, RLS per role).
- Advisor view (user opts in to share a plan summary) for bank demos.
- Weekly re-crawl + change alerts.

## 7. Demo script (90 seconds)
1. Open Lifeline in Punjabi. Type: "I came from India last year on a work permit, my wife stays home with our 2-year-old, we rent in Brampton."
2. Profile card fills live; one follow-up question with buttons (income range).
3. Plan appears: CCB, Ontario Child Benefit, Canada Groceries and Essentials Benefit (needs first tax return), RESP + CESG, OTB. Estimated money on the table shown.
4. Ask: "If I put $100 a month into an RESP, how much does the government add?" -> calculator answer using the facts-table rate, with a source link.
5. Switch to the Student profile -> a different plan.
6. Ask "Should I buy Tesla?" -> polite refusal with a scope note.

## 8. Risks and mitigations
| Risk | Mitigation |
|---|---|
| Wrong numbers | Facts table only; `verify` gate; weekly re-check |
| Model answers from memory | System prompt rule + claim check + golden tests |
| Weak Punjabi/Urdu quality | Native-speaker spot check; same-script replies; fallback to EN link |
| Scope creep | Four personas, Ontario only, ~16 programs, hard stop |
| Crawling government sites | Respect robots.txt, low rate, allowlist only, cache |

## 9. Resume bullet (update numbers when real)
> Built Lifeline, a tool-calling AI assistant in 8 languages that fills a structured profile through chat and routes questions to a deterministic eligibility rules engine (N programs), a versioned facts table, and RAG over official sources with code-attached citations, passing N golden-question tests in CI

## 10. Status (2026-10-03)

v1 code complete; see CHANGELOG.md. Deviations from this plan, decided during the build:

- **Facts live in git** (`src/lib/facts/facts.seed.json`) and are mirrored to Postgres. Runtime reads the JSON so every number traces to a reviewed commit.
- **No token streaming.** Every sentence is claim-checked before display; the chat streams tool progress instead.
- **Statement classifier is rules-only** (no model fallback) so raw descriptions never reach the provider (§3.5).
- **Profile facts have a pending slot** (migration 0002) so an inferred value never overwrites a confirmed one.
- **Program-name claim check** is not implemented yet; numbers are checked.
- **Action/reason strings** are translated in EN and FR only; other languages fall back to English (needs native-speaker translation and review).

Still to do before a public demo: human verification of all 20 programs and 41 facts; run golden questions with a key; ingest from a network canada.ca allows; native-speaker review for PA/UR/HI/AR/ZH.
