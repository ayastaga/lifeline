# Changelog

## 0.2.0 — 2026-10-04 (milestone 1: verified vertical slice)

### Added
- **Claims layer** (`src/lib/claims`): every roadmap item is built from claim objects carrying sources (with tier, quoted span and retrieval date), the user facts and rules they depend on, and a status. Fact status is computed (official + quoted = verified; secondary = unverified; past tax year = may have changed). Calculations take the weakest status of their inputs. Conflicting values for one fact mark both as conflict.
- **TFSA, FHSA, RESP catch-up**: 15 new facts verified against CRA / Finance Canada pages on 2026-10-04 (TFSA dollar-limit table 2009–2026, newcomer and withdrawal rules, FHSA limits and carry-forward, CESG room and age rules); CLB facts upgraded to official. Calculators reproduce CRA's own worked examples.
- **Roadmap** ordered by tier (unlocks money / loses value yearly / set up once / habits), with "Why am I seeing this?": what you told us, assumptions, personal calculations, official quotes with links and statuses, and what's still unknown.
- **No persona tracks**: every program is evaluated; the engine records which user facts each decision used.
- **Onboarding by information value**: `next_questions` ranks unknown facts by how much of the roadmap they unblock.
- **Voice**: speech-to-text and text-to-speech behind a provider interface (OpenAI; Sarvam for Hindi/Punjabi), routed per language. Input language, reply language and reply mode are independent. Spoken facts are staged as `spoken` and read back by code in the reply language. The voice layer speaks the already-verified text and cannot change it.
- **Mobile app** (`mobile/`, Expo SDK 57): hold-to-talk with a "let me check that" filler, typed fallback, roadmap with "why", profile confirmation, settings. Shares translations and the claim renderer with the web app.
- API: `/api/voice`, `/api/tts` (fixed phrases only), `/api/roadmap`; `/api/chat` accepts `replyLanguage`; session header for native clients.
- Migration `0003_claims.sql`.
- Tests: 90 passing (new: accounts, claims/roadmap/next questions, voice pipeline with fake speech providers); golden set now 50 text cases plus an audio manifest.

### Changed
- Web plan view is now the tiered roadmap with "why"; onboarding asks the server-ranked question.
- System prompt rewritten for claims, statuses, assumptions, conversational onboarding and voice.

### Not done yet (milestone 1 acceptance)
- Golden text and audio sets haven't been run (need API keys and recordings).
- The mobile app has been typechecked and bundled for Android, not run on a device.
- First South Asian voice language not yet chosen by testing with real speakers.

## 0.1.0 — 2026-10-03 (v1, built from the starter)

### Research findings that changed the plan
- The GST/HST credit became the **Canada Groceries and Essentials Benefit** on 2026-07-03 (same rules, +25% for 2026–2031). Program id kept as `gst_hst_credit`; name, URL and amounts updated.
- Lowest federal tax rate is 14% for 2026, so federal non-refundable credits (tuition, student loan interest) use 14%, not 15%.
- `ontario.ca/page/ontario-energy-and-property-tax-credit` returns 404; OEPTC now cites the Ontario Trillium Benefit page.
- canada.ca blocks datacenter IPs (HTTP 503); run ingest from an allowed network.

### Added
- 20 programs (was 3), each `verify: true`, with `kind` and optional `verify_note`.
- Facts table filled: 41 entries (38 with values, 3 deliberate nulls), each with `source_quality`.
- Rules engine (partial profiles, `none` operator, unknown-safe `ne`), plan generator with "up to" estimates.
- Calculators: CESG, HST registration (quarter + four-quarter tests, ride-share override), gig tax set-aside (2026 CPP/CPP2 exact; income tax estimate), OEPTC occupancy cost.
- AI layer: OpenAI/Qwen provider, tool executor, system prompt, orchestrator, composer (claim check, citations, refusal).
- RAG: chunking, ingest (robots.txt, rate limit, content hash, change report), hybrid search with program filter, optional reranker, abstain threshold.
- CSV statements: parser for amount or debit/credit exports, rule categories, hints staged for confirmation.
- Store interface with Supabase (anonymous auth + RLS) and in-memory implementations; middleware assigns one session per visitor.
- UI: chat with progress events and sources, profile card with confirm-before-save, onboarding questions, plan view, upload; 8 languages, RTL, per-script fonts.
- Migration `0002_v1.sql`: jsonb fact values, pending profile facts, program kind, `search_chunks` with program filter.
- Profile schema: `hasDentalInsurance`, `paidStudentLoanInterest`, `rideshareDriver`, `hasEmploymentIncome`; `age` added to onboarding (GST rule required it).
- Tests: 58 passing (rules, calculators, composer, language detection, statements, data integrity, offline orchestrator); 42 golden questions (skipped without a key).

### Fixed during the build
- Composer split "1." list markers into their own sentences.
- Parallel first requests created two sessions (would have created two anonymous Supabase users).
- English fallback text inside RTL pages had misplaced punctuation and the wrong font.
