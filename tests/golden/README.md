# Golden questions

Plain tests, not research. Each case sets a profile, asks one question, and
checks a few things the pipeline must get right:

- `tools_called` — the orchestrator used the right tools (order not checked).
- `programs_mentioned` — these program ids came back as eligible / likely / need-more-info from `check_eligibility`.
- `must_include_citation` — at least one citation URL was attached by code.
- `must_not_state_numbers_without_lookup` — the claim check replaced nothing, i.e. the model's draft contained no number that was missing from tool results or the user's words.
- `reply_language` / `reply_script` — detected on the reply text.
- `must_refuse` — refusal marker present and no tools were called.

Run with `npm run test:golden` (needs `OPENAI_API_KEY` in `.env.local`; skipped otherwise).
Temperature 0, seed 7, pinned model id (`OPENAI_MODEL`) so results are stable.
Fixed "today" of 2026-10-03 so deadline questions don't drift.

Coverage: 20 English, 3–4 per other language. Target from the plan is ~30 English:
add a case every time a bug is fixed. `tests/orchestrator.test.ts` covers the same
pipeline offline with a scripted model and runs in CI without a key.

## Milestone 1 additions

- 8 new text cases (`*-m1-*`): the "what am I missing?" demo, TFSA room, RESP catch-up, FHSA timing, onboarding (`next_questions`), an ETF refusal, and Hindi/Punjabi account questions.
- **Audio set** (`tests/golden/audio/`): recorded questions from real speakers, listed in `manifest.json` with the numbers and terms that must survive transcription. `audio.test.ts` runs every case whose file exists, against the provider chosen by `SPEECH_STT_ROUTES`. Record with consent; don't commit audio from people who haven't agreed to publication.
- Voice pipeline behaviour (read-back, independent reply language, the voice layer not changing answers) is covered offline in `tests/voice.test.ts`.
