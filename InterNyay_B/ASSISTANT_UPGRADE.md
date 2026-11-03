# Assistant upgrade

## What changed
- Streaming replies with live status (`POST /api/chat/stream`, server-sent events). `POST /api/chat` still works.
- Confirmed actions: add a task, mark a task completed, add a note to a hearing. Nothing is saved until the advocate presses Confirm.
- Legal library: `legal_search` tool over `src/main/resources/legal-knowledge/*.md` plus any folder set in `CHAT_KNOWLEDGE_DIR`.
- Feedback (thumbs) and run logging in `chat_feedback` and `chat_runs` (migration V61).
- Admin tab "AI Assistant": usage, how questions ended, poor answers, failed runs, answers given without a lookup, most used lookups, the legal library size with a reload button, and a test-question run (`src/main/resources/chat-eval.json`) that can be re-run for the failed questions only. Every figure, including the votes and the poor-answers list, follows the chosen period (7, 30 or 90 days).
- Daily brief: `GET /api/chat/brief`, no AI call, built from the same lookups the assistant uses.
- Cost and robustness: stable prompt prefix first, older history trimmed to 400 characters, rate-limit wait capped at 4 seconds, model-driven support routing, concurrency cap of 12 streams.

## Configuration
CHAT_TIMEOUT_SECONDS, CHAT_STREAM_USAGE (set true if the provider supports stream_options.include_usage, to record token counts), CHAT_LOG_QUESTIONS (false stops storing question text), CHAT_KNOWLEDGE_DIR (folder of extra .md files). CHAT_MAX_RATE_WAIT_SECONDS (longest wait for the provider's rate limit; `.env.example` uses 4).

## Reverse proxy
Streaming needs response buffering off for `/api/chat/stream`. The app sends `X-Accel-Buffering: no`, which nginx honours. Keep `proxy_read_timeout` above `CHAT_TIMEOUT_SECONDS`.

## Before release
- Confirm the section tables in `legal-knowledge` against the bare acts.
- Add court practice directions as .md files in the knowledge folder, then use "Reload legal library" in the admin tab.
- Run the test questions from the admin tab after changing the model or the prompt.
