# Roots edge functions

All four functions operate on the single `interviews` row where `active = true`
(the "current" session the recording box is talking to). They use the
**service-role key** server-side, so RLS does not block writes. There is a
partial unique index enforcing at most one active interview at a time.

Base URL pattern:

```
https://<PROJECT-REF>.supabase.co/functions/v1/<function-name>
```

Locally with `supabase functions serve`:

```
http://127.0.0.1:54321/functions/v1/<function-name>
```

All requests need the project's anon (or service-role) key:

```
Authorization: Bearer <SUPABASE_ANON_KEY>
apikey:        <SUPABASE_ANON_KEY>
```

All responses are JSON. On success they include `ok: true` and the
`interview_id` they acted on. On failure they return `{ "error": "..." }`
with a 4xx/5xx status.

---

## `process-transcript`

Update the running transcript for a single question on the active interview.
The device calls this whenever it finishes (or refines) the transcription of
the current question. If the `question` already exists in the transcript, its
`response` is replaced; otherwise a new `{ question, response }` entry is
appended.

- **Method:** `POST`
- **Body:** JSON

```json
{
  "question": "Where did you grow up?",
  "transcript": "I grew up in a little town in northern Italy..."
}
```

**Example:**

```bash
curl -X POST "$SUPABASE_URL/functions/v1/process-transcript" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"question":"Where did you grow up?","transcript":"I grew up in..."}'
```

**Response:**

```json
{
  "ok": true,
  "interview_id": "…",
  "entries": [{ "question": "...", "response": "..." }]
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
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "apikey: $SUPABASE_ANON_KEY" \
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

Looks at the transcript so far on the active interview and returns two
AI-suggested next questions:

- `shift_question` — gently pivots to a new topic / life chapter.
- `deeper_question` — drills into the most recent answer for more detail.

Both are also persisted onto the active interview row (`shift_question`,
`deeper_question`) so the device/app can read the latest suggestions without
re-calling the LLM.

Requires the `OPENAI_API_KEY` function secret. If unset, the function returns
canned fallback questions instead of failing.

- **Method:** `GET` (or `POST` — body is ignored)

**Example:**

```bash
curl "$SUPABASE_URL/functions/v1/get-interview-questions" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "apikey: $SUPABASE_ANON_KEY"
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

## `get-interview-started`

Returns whether the active interview has been kicked off yet. The recording
box polls this so it can power up its lights/motors the moment the app flips
the session to "started".

- **Method:** `GET`

**Example:**

```bash
curl "$SUPABASE_URL/functions/v1/get-interview-started" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "apikey: $SUPABASE_ANON_KEY"
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
  process-transcript upload-video get-interview-questions get-interview-started
supabase secrets set OPENAI_API_KEY=sk-...
```
