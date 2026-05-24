# Roots edge functions

All session functions operate on the single `interviews` row where `active = true`
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
JSON. On success they include `ok: true` and the relevant id. On failure they
return `{ "error": "..." }` with a 4xx/5xx status.

---

## Session lifecycle (device flow)

```
App taps "Begin"
  → INSERT interviews (active=true)           (app-side SQL)
  → device polls get-interview-status          until status === 'completed'
  → device posts process-transcript            repeatedly as ASR progresses
      └─ triggers suggest-next-questions        (debounced, background)
  → device polls get-interview-questions        to read fresh prompts
App taps "End session"
  → UPDATE interviews SET status='completed'  (app-side SQL)
  → device uploads video via upload-video
      └─ triggers process-interview             (background)
          └─ triggers embed-person              (background)
```

---

## `get-interview-status`

Returns the current status of the active interview. The **device polls this**
after the session starts; when status becomes `'completed'` (set by the app
when the user taps "End session") the device knows to stop recording and upload.

- **Method:** `GET`

**Example:**

```bash
curl "$SUPABASE_URL/functions/v1/get-interview-status"
```

**Response (active session):**

```json
{
  "ok": true,
  "interview_id": "…",
  "status": "started"
}
```

**Response (no active interview):**

```json
{ "error": "no active interview" }
```
(404)

---

## `process-transcript`

Replaces the full transcript text on the active interview. The device calls
this periodically as transcription progresses; each call **overwrites** the
previous value with the complete transcript up to that point (not a delta).

**Side effect:** debounce-triggers `suggest-next-questions` in the background
(fire-and-forget) under three conditions:
1. The transcript has never had a suggestion run (first chunk of a new session).
2. The transcript has grown by ≥ 300 chars **and** at least 10 s have passed
   since the last suggestion.
3. One of the currently-stored questions is detected in the new transcript
   (fuzzy match — the interviewer asked it), which immediately re-suggests.

The device should never call `suggest-next-questions` directly; just keep
posting transcripts and reading `get-interview-questions`.

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

## `get-interview-questions`

Returns the two most-recently-generated follow-up questions stored on the
active interview. **This is a cheap DB-only read — no LLM call.** Questions
are written by `suggest-next-questions` and cached here so the device can poll
at any rate without paying LLM cost each time.

- `shift_question` — pivots the conversation onto a fresh topic.
- `deeper_question` — drills further into what the subject just shared.

Falls back to simple placeholder questions if none have been generated yet.

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
calls **GPT-4o-mini** to generate two short, concrete follow-up questions and
persists them onto the interview row. In normal operation you don't call this
directly — `process-transcript` fires it in the background on a debounced
schedule. This endpoint remains exposed for manual refresh / debugging.

Each generated question is hard-constrained to ≤ 32 characters — telegraphic,
contraction-heavy phrasing so the interviewer can glance and ask immediately.

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
  "deeper_question": "What'd that bakery smell like?",
  "shift_question": "First job — how'd it start?"
}
```

---

## `upload-video`

Upload the full session video at the end of an interview. Stores the file in
the `interview-videos` Storage bucket under `<interview_id>/<timestamp>.<ext>`,
saves the public URL to `interviews.video`, and sets `status` to `'completed'`
(session closed).

**Side effect:** fires `process-interview` in the background (fire-and-forget)
once the video is stored, so Whisper transcription and memory extraction begin
automatically without the device waiting.

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

## `process-interview`

Called automatically (background) by `upload-video` once the video lands. Can
also be called manually by the app right after a session ends.

1. **Whisper step** — if the interview has a `video` URL and no word timestamps
   yet, fetches the video, sends it to Whisper (`verbose_json` + word timestamps),
   and writes the cleaner transcript + `transcript_words` array back to the row.
2. **Extraction step** — calls GPT-4o to extend the person's `memories` and
   `timeline` jsonb arrays with anything new from this session. When word
   timestamps are available the model returns per-memory `clips` arrays
   (start/end seconds); adjacent clips ≤ 3 s apart are merged before writing.
3. **Merge step** — re-merges by `id` server-side so no existing entry can be
   deleted even if the model disobeys the "never remove" instruction.
4. Fires `embed-person` in the background to rebuild RAG chunks.

Requires `OPENAI_API_KEY`.

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

## `embed-person`

Rebuilds the `chunks` table for a single person. Called fire-and-forget at
the tail of `process-interview`; can also be called on demand (e.g. when the
chat screen detects no chunks exist yet).

Produces three kinds of chunks:
- **memory** — one chunk per memory (title + snippet + tags + year).
- **timeline** — one chunk per timeline entry.
- **transcript** — 30-second windows from `transcript_words` (word-timestamp
  sliced), or 600-character windows when no timestamps are available.

Embeddings use `text-embedding-3-small` (1536-dim), batched in groups of 96.
Idempotent: deletes the person's existing chunks then inserts fresh ones.

Requires `OPENAI_API_KEY`.

- **Method:** `POST`
- **Body:** JSON

```json
{ "personId": "<uuid>" }
```

**Example:**

```bash
curl -X POST "$SUPABASE_URL/functions/v1/embed-person" \
  -H "Content-Type: application/json" \
  -d '{"personId":"<uuid>"}'
```

**Response:**

```json
{ "ok": true, "person_id": "…", "chunks": 42 }
```

---

## `chat`

RAG chat over a person's recorded memories. Embeds the user's query, retrieves
the top 8 chunks via `match_chunks` (pgvector similarity), then streams a
GPT-4o response as **Server-Sent Events**.

`personId` may be `null` to search across all people in the library.

SSE event sequence:
1. `sources` — JSON array of the chunks used as context (with `kind`,
   `interview_id`, `ref_id`, `start_sec`, `end_sec`, `year`, `title`, `text`).
   The model inlines `[c1]`, `[c2]` … citations that map to this array.
2. `delta` — repeated; each has `{ "text": "…" }` (streaming token).
3. `done` — `{ "ok": true }`.
4. `error` — if something goes wrong mid-stream.

Requires `OPENAI_API_KEY`.

- **Method:** `POST`
- **Body:** JSON

```json
{
  "personId": "<uuid or null>",
  "messages": [
    { "role": "user", "content": "What did grandma say about her first job?" }
  ]
}
```

**Example:**

```bash
curl -N -X POST "$SUPABASE_URL/functions/v1/chat" \
  -H "Content-Type: application/json" \
  -d '{"personId":null,"messages":[{"role":"user","content":"What did she say about Turin?"}]}'
```

**Response** (SSE stream):

```
event: sources
data: [{"n":1,"kind":"transcript","interview_id":"…","start_sec":42.1,...}]

event: delta
data: {"text":"She mentioned"}

event: delta
data: {"text":" leaving Turin in 1962 [c1]."}

event: done
data: {"ok":true}
```

---

## Setting up an active interview

These session functions all assume there's already a row in `interviews` with
`active = true`. The app is responsible for creating that row when the user
taps "Begin" on the Connect screen. A minimal SQL example:

```sql
update public.interviews set active = false where active = true;
insert into public.interviews (person_id, active)
values ('<person uuid>', true);
```

## Deploy

```bash
supabase db push
supabase functions deploy \
  get-interview-status \
  process-transcript get-interview-questions suggest-next-questions \
  upload-video process-interview \
  embed-person chat
supabase secrets set OPENAI_API_KEY=sk-...
```
