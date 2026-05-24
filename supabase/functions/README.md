# Roots edge functions

All four functions operate on the single `interviews` row where `active = true`
(the "current" session the recording box is talking to). They use the
**service-role key** server-side, so RLS does not block writes. There is a
partial unique index enforcing at most one active interview at a time.

Dashboard: https://supabase.com/dashboard/project/hmggakolwdysrcitibry/functions

Base URL pattern:

```
https://hmggakolwdysrcitibry.supabase.co/functions/v1/<function-name>
```

Locally with `supabase functions serve`:

```
http://127.0.0.1:54321/functions/v1/<function-name>
```

All functions have `verify_jwt = false` — **no API key is required**. Call the
URL directly; no `Authorization` or `apikey` header needed. All responses are
JSON. On success they include `ok: true` and the `interview_id` they acted on.
On failure they return `{ "error": "..." }` with a 4xx/5xx status.

---

## `process-transcript`

Replaces the full transcript text on the active interview. The device calls
this periodically as transcription progresses; each call **overwrites** the
previous value with the complete transcript up to that point (not a delta).

**Side effect:** debounce-triggers `suggest-next-questions` in the background
(fire-and-forget) when the transcript has grown by ≥1000 chars *and* at least
45s have passed since the last suggestion — or unconditionally on the first
chunk of a new interview. The device should never call `suggest-next-questions`
directly; just keep posting transcripts and reading `get-interview-questions`.

- **Method:** `POST`
- **Body:** JSON

```json
{
  "transcript": "I was born in 1942... we lived in a small village near Turin..."
}
```

**Example:**

```bash
curl -X POST "$SUPABASE_URL/functions/v1/process-transcript" \
  -H "Content-Type: application/json" \
  -d '{"transcript":"I was born in 1942..."}'
```

**Response:**

```json
{
  "ok": true,
  "interview_id": "…"
}
```

---

## `upload-video`

Upload the full session video at the end of an interview. Stores the file in
the `interview-videos` Storage bucket under `<interview_id>/<timestamp>.<ext>`,
saves the public URL to `interviews.video`, and flips `active` and `started`
back to `false` (session closed).

- **Method:** `POST`
- **Body:** `multipart/form-data` with a single `file` field.

**Example:**

```bash
curl -X POST "$SUPABASE_URL/functions/v1/upload-video" \
  -F "file=@./session.mp4"
```

**Response:**

```json
{
  "ok": true,
  "interview_id": "…",
  "video": "https://…/storage/v1/object/public/interview-videos/…/….mp4"
}
```

---

## `get-interview-questions`

Returns the two most-recently-generated follow-up questions stored on the
active interview. **This is a cheap DB-only read — no LLM call.** Questions
are written by `suggest-next-questions` and cached here so the device can poll
at any rate without paying LLM cost each time.

- **Method:** `GET`

**Example:**

```bash
curl "$SUPABASE_URL/functions/v1/get-interview-questions"
```

**Response:**

```json
{
  "ok": true,
  "interview_id": "…",
  "shift_question": "Tell me about where you grew up — what was your neighborhood like?",
  "deeper_question": "What did that moment feel like for you at the time?"
}
```

---

## `suggest-next-questions`

Reads the active interview's transcript and the subject's `people` record, then
calls **Claude** to generate two tailored follow-up questions and persists them
onto the interview row. In normal operation you don't call this directly —
`process-transcript` fires it in the background on a debounced schedule. This
endpoint remains exposed for manual refresh / debugging.

- `deeper_question` — drills into the most emotionally resonant or specific detail already mentioned, inviting the subject to relive that moment.
- `shift_question` — opens a new chapter of their life that hasn't come up yet, bridging naturally from the conversation.

Requires the `OPENAI_API_KEY` function secret. Returns cached fallback
questions if the secret is unset or the API call fails.

- **Method:** `POST` (no body required)

**Example:**

```bash
curl -X POST "$SUPABASE_URL/functions/v1/suggest-next-questions"
```

**Response:**

```json
{
  "ok": true,
  "interview_id": "…",
  "deeper_question": "You mentioned your grandmother's kitchen — what did it smell like in there, and what would she be making?",
  "shift_question": "Before we leave those early years, I'd love to hear about your first job — how did you end up there?"
}
```

---

## `process-interview`

Called by the app the moment an interview ends (right after flipping `active`
to false). Loads the person's existing `memories` and `timeline` jsonb arrays
plus the new transcript, asks OpenAI to extend them with anything new the
person said, and writes the merged arrays back to the `people` row.

The system prompt instructs the model **never to delete or rewrite existing
entries** — only to add new ones (or extend cross-references on existing ones).
The function also re-merges by `id` server-side as a safety net, so even if the
model disobeys, no prior memory or timeline entry can be lost.

Requires the `OPENAI_API_KEY` function secret.

- **Method:** `POST`
- **Body:** JSON

```json
{ "interviewId": "<uuid of the just-ended interview>" }
```

**Response:**

```json
{
  "ok": true,
  "interview_id": "…",
  "person_id": "…",
  "memoriesCount": 7,
  "timelineCount": 4,
  "memoriesAdded": 2,
  "timelineAdded": 1
}
```

---

## `get-interview-started`

Returns whether the active interview has been kicked off yet. The recording
box polls this so it can power up its lights/motors the moment the app flips
the session to "started".

- **Method:** `GET`

**Example:**

```bash
curl "$SUPABASE_URL/functions/v1/get-interview-started"
```

**Response:**

```json
{
  "ok": true,
  "interview_id": "…",
  "started": false
}
```

---

## Setting up an active interview

These functions all assume there's already a row in `interviews` with
`active = true`. The app is responsible for creating that row (and toggling
`started` to `true` when the user taps "Begin" on the Connect screen). A
minimal SQL example:

```sql
update public.interviews set active = false where active = true;
insert into public.interviews (person_id, active, started)
values ('<person uuid>', true, false);
```

## Deploy

```bash
supabase db push
supabase functions deploy \
  process-transcript upload-video get-interview-questions get-interview-started \
  suggest-next-questions process-interview
supabase secrets set OPENAI_API_KEY=sk-...
```
