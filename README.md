# Lifeline — Multilingual Financial Assistant

A financial assistant that works _with_ you. Tell it your situation (student, newcomer, family, gig worker), optionally upload a bank statement, and ask about benefits, credits, taxes and money basics in 8 languages: English, French, Mandarin, Hindi, Urdu, Punjabi (Gurmukhi and Shahmukhi), Arabic, Spanish.

**Design rule:** the model only routes and explains. Every number and every eligibility answer comes from code: a rules engine, a versioned facts table and calculators. RAG over official government pages supplies explanations. Citations are attached by code, and a claim check removes any sentence containing a number that no tool returned.

> **Heads-up (July 2026):** the GST/HST credit was renamed the **Canada Groceries and Essentials Benefit (CGEB)** on 2026-07-03, with amounts up 25% until 2031. The program id stays `gst_hst_credit` for compatibility.

> **Milestone 1 is built** (see `docs/PLAN.md` §9 and `CHANGELOG.md` 0.2.0): claim objects with sources and statuses, TFSA / FHSA / RESP catch-up calculators, a tiered roadmap with "Why am I seeing this?", onboarding that asks for the most useful missing fact, voice in/out with independent reply language and read-back, and an Expo mobile app in `mobile/`.

## Milestone 1 in two minutes

```bash
npm install && cp .env.example .env.local      # OPENAI_API_KEY (+ SARVAM_API_KEY for Hindi/Punjabi voice)
npm run dev                                    # API + web client on :3000

cd mobile && npm install
EXPO_PUBLIC_API_URL=http://<your-LAN-IP>:3000 npx expo start   # then a development build (expo-audio is native):
npx expo run:android    # or run:ios, or: npx eas-cli@latest build --profile development
```

Ask, by voice or text: _"I moved to Ontario in 2024. I'm 34, I have two kids, and I've never bought a home. What am I missing?"_

## Quick start (demo mode: one API key, no database)

```bash
npm install
cp .env.example .env.local      # set OPENAI_API_KEY only
npm run dev                     # http://localhost:3000
npm test                        # 58 unit/integration tests, no key needed
npm run test:golden             # 42 golden questions against the real model
```

Without Supabase settings, Lifeline stores profiles in server memory (lost on restart) and `search_docs` abstains with an official link. Everything else (rules, facts, calculators, plan, CSV upload, 8-language UI) works.

## Full setup (Supabase + RAG)

```bash
npx supabase init               # then in supabase/config.toml: [auth] enable_anonymous_sign_ins = true
npx supabase start
npx supabase db reset           # applies 0001_init.sql and 0002_v1.sql
# copy the local URL, anon key and service-role key into .env.local
npm run seed:facts
npm run seed:programs
npm run ingest                  # crawls scripts/sources.json -> chunks -> embeddings
```

Every visitor gets an anonymous Supabase user; RLS (`auth.uid() = user_id`) isolates their rows.

**Crawling canada.ca:** on 2026-10-03, canada.ca returned HTTP 503 to every request from a datacenter IP, whatever the user-agent. Run `npm run ingest` from a residential connection (or a machine canada.ca allows) and commit nothing; chunks live in Postgres. ontario.ca pages fetched fine.

## Architecture

```
Onboarding buttons ─┐
CSV statement ──────┼──► pending facts ──(user confirms)──► confirmed profile (RLS)
Chat ───────────────┘                                              │
                                                                   ▼
                             Orchestrator (OpenAI tool calling, temp 0, max 6 steps)
          ┌──────────────┬──────────────┬───────────────┬──────────────┬─────────────────┐
          ▼              ▼              ▼               ▼              ▼                 ▼
   update_profile  check_eligibility  lookup_fact   search_docs     calculate     query_transactions
   (stage only)    (rules engine)     (facts JSON)  (pgvector+FTS)  (4 calculators) (aggregates only)
          └──────────────┴──────────────┴───────────────┴──────────────┴─────────────────┘
                                                   ▼
                     Composer: strip model-written links → claim check (numbers) → attach citations
                                                   ▼
                               Reply in the detected language and script
```

## Milestone 1 architecture

```
voice ─► SpeechToText (Sarvam hi/pa, OpenAI otherwise; biased to TFSA/RESP/CRA…) ─┐
text  ──────────────────────────────────────────────────────────────────────────┤
                                                                                 ▼
           orchestrator (input language ≠ reply language allowed)  ── tools ──► rules engine
                                                                               ► explain_item ─► roadmap ─► claims
                                                                               ► next_questions         (eligibility, facts with quotes,
                                                                               ► calculate               calculations, assumptions, unknowns)
                                                                                 │
                     composer: number check + citations ◄────────────────────────┘
                                 │
           read-back of spoken facts (code, not model) ──► TextToSpeech (same verified text) ─► audio
```

- `src/lib/claims/`: claim objects, statuses (verified / calculated / needs_fact / unverified / conflict / may_have_changed), conflict detection, shared renderer.
- `src/lib/roadmap/`: tiered roadmap, per-item claims and "why".
- `src/lib/profile/nextQuestions.ts`: ranks unknown facts by how many roadmap items they'd unblock.
- `src/lib/calculators/accounts.ts`: `tfsa_room`, `fhsa_room`, `resp_catch_up` (tests reproduce CRA's worked examples).
- `src/lib/speech/`: `SpeechProvider` interfaces, OpenAI + Sarvam adapters, per-language router, `voiceTurn`.
- `src/app/api/{voice,tts,roadmap}`: voice turn, fixed-phrase filler audio, roadmap + next questions.
- `mobile/`: Expo SDK 57 app (Talk, Roadmap, Profile, Settings) sharing i18n strings and the claim renderer via Metro `watchFolders`.

## What is where

```
src/lib/
  profile/schema.ts        zod profile schema (single source of truth), validateFact
  profile/onboarding.ts    next question from QUESTION_ORDER; children parser
  rules/programs/*.json    20 programs, one file each, all "verify": true
  rules/engine.ts          evaluate(partialProfile) -> eligible | likely | not_eligible | need_more_info
  facts/facts.seed.json    41 numbers with source URL, last checked, source quality
  calculators/index.ts     cesg_grant, hst_registration, gig_tax_set_aside, rent_credit_estimate
  plan/index.ts            results -> plan items, deadlines, "up to" estimates
  ai/provider.ts           OpenAI | Qwen (same OpenAI-compatible client) + embeddings
  ai/tools.ts              tool schemas (zod -> JSON schema) and executor
  ai/prompt.ts             system prompt
  ai/orchestrator.ts       one turn: detect language -> tool loop -> compose -> persist
  ai/composer.ts           claim check, citations, refusal handling
  rag/                     chunking, ingest (robots.txt, rate limit, content hash), hybrid search
  statements/              CSV parsing, rule-based categories, derived hints
  i18n/                    detection (language + script), 8 string tables, formatting
  store/                   Store interface: Supabase (RLS) and in-memory implementations
src/app/api/               chat (NDJSON progress stream), profile, plan, upload, feedback, ingest
src/components/            LifelineApp, Chat, FilePanel
supabase/migrations/       0001_init.sql (given), 0002_v1.sql
scripts/                   seed-facts, seed-programs, ingest, check-verify, sources.json
tests/                     unit, offline orchestrator (scripted model), golden/
```

## Accuracy guarantees, and their limits

- **Numbers:** the composer extracts every number in the draft (handles `8,157`, `8 157`, `146,66`, `30k`, Devanagari/Gurmukhi/Arabic-Indic digits). A sentence with a number not found in tool outputs, the user's message or their profile is replaced by "see the official page". This also blocks the model's own arithmetic (e.g. annual to monthly). Program names are not yet checked this way.
- **Eligibility:** only `check_eligibility` decides, and only on **confirmed** facts. Facts the model extracts from chat wait on the profile card.
- **Unknown values:** facts with `value: null` return `status: "unverified"`; the model is told to say it isn't sure.
- **Not streamed token by token:** every sentence is checked before display, so the chat streams progress ("Checking the eligibility rules") instead.
- **Verify gate:** `npm run check:verify` lists unverified programs and facts; with `LIFELINE_ENFORCE_VERIFY=1` it exits non-zero. Every program and fact is still unverified: a person must check each against the official page (see `source_quality`: `official`, `secondary`, `knowledge`).

## Privacy

CSV files are parsed in memory and never stored; only categorized rows are kept per user (RLS), and only derived hints ("rent payments found") become pending facts. Categorization is rules-only so raw descriptions never reach the model provider. Logs contain no user content.

## Non-goals (v1)

No investment advice, product recommendations or tax filing. No live bank connections. Ontario and federal programs only.

## Disclaimer

Lifeline provides general information from official government sources. It is not tax, legal or financial advice. Always confirm with the official page linked in each answer.
