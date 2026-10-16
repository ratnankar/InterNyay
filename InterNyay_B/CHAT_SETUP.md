# InterNyay Assistant setup

The assistant answers questions about the signed-in advocate's own cases, clients, hearings, fees, documents, tasks, expenses, judges, rosters, holidays, notifications, police directory and DRT / consumer jurisdiction. It is read only.

It works with any model served through an OpenAI-compatible `/chat/completions` endpoint that supports tool calling. Switching models is a configuration change only. InterNyay uses Groq.

## Configure

Set these in the backend `.env` (or as OS environment variables) and restart:

| Variable | Meaning |
| --- | --- |
| `CHAT_BASE_URL` | Base URL of the provider, ending before `/chat/completions` |
| `CHAT_MODEL` | Model name exactly as the provider lists it |
| `CHAT_API_KEY` | The provider's API key |

The assistant is enabled once `CHAT_BASE_URL` and `CHAT_MODEL` are both set.

## Groq (in use)

```
CHAT_BASE_URL=https://api.groq.com/openai/v1
CHAT_MODEL=openai/gpt-oss-20b
CHAT_API_KEY=your-groq-key
```

1. Create an API key in the Groq console.
2. In production put the three values in the server's `.env`, never in git or in the zip. Use a different key for development and for production.
3. Restart the backend and check `GET /api/chat/status` returns `{ "enabled": true }`.

## Other providers

Any OpenAI-compatible provider works the same way, for example:

```
# Google Gemini
CHAT_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
CHAT_MODEL=gemini-2.0-flash

# OpenRouter
CHAT_BASE_URL=https://openrouter.ai/api/v1
CHAT_MODEL=provider/model-name

# OpenAI
CHAT_BASE_URL=https://api.openai.com/v1
CHAT_MODEL=gpt-4o-mini
```

Model names and free-tier terms change; check the provider's current list. Anthropic models can be used through an OpenAI-compatible gateway such as OpenRouter.

## Choosing a model

- The model must support tool calling. Without it the assistant cannot read your data.
- Test on cases where you know the answer, because models can make mistakes on exact amounts and dates.
- Check the provider's data policy. Free hosted tiers may use prompts for training, and client records are sensitive, so prefer a plan with a no-training policy.
- Check the provider's rate limits. Several advocates chatting at once can hit per-minute limits and see errors.

## How it stays private

- Every lookup runs on the server through the same account scoping the rest of the API uses. The model never receives a database handle, only the results of a fixed set of read-only lookups for the signed-in advocate.
- Associates get the advocate's cases and clients but no fee, billing or transaction data.
- Admin accounts do not see the chat.

## Other settings (application.properties)

| Property | Default |
| --- | --- |
| `internyay.chat.max-tokens` | `3072` (reasoning models such as gpt-oss spend part of this on thinking) |
| `internyay.chat.max-tool-rounds` | `8` |
| `internyay.chat.max-tool-result-chars` | `14000` (longer results are shortened by dropping list entries and the model is told the list is partial) |
| `internyay.chat.timeout-seconds` | `600` |

Larger limits send more text to the model on every question, which uses more of the provider's rate limit. If answers are cut off on long lists, raise `internyay.chat.max-tool-result-chars` further.

## Endpoints

- `GET /api/chat/status` returns `{ "enabled": true|false }`.
- `POST /api/chat` takes `{ "messages": [{ "role": "user", "content": "..." }] }` and returns `{ "reply": "..." }`. Send the running conversation each time.
