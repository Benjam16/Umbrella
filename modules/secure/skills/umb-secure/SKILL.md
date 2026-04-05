# /umb:secure-* (Security)

Guardrails for secrets, destructive commands, and data retention.

- Never echo API keys or tokens.
- Prefer environment variables for secrets (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `TELEGRAM_BOT_TOKEN`, etc.).
- Use /umb:memory-forget for accidental sensitive ingest (module extension).
