Umbrella runtime slash-style cues for operators:

- Ingest: store goals or facts into memory (Telegram: `/umb ingest ...`).
- Recall: pull context before planning.
- Planner uses an LLM when `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `GEMINI_API_KEY` / `GOOGLE_API_KEY` is set (`UMBRELLA_LLM_PROVIDER` disambiguates if needed); otherwise a safe fallback XML plan.
