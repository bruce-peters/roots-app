// POST /process-transcript
// Body: { transcript: string }
// Replaces the full transcript text on the active interview.
// The device sends this periodically as transcription progresses,
// each call overwrites the previous text.
//
// Side effect: debounce-triggers suggest-next-questions in the background
// when the transcript has grown enough (or no suggestion has ever run for
// this interview). The trigger is fire-and-forget so the device never waits
// on the 5–7s LLM call.

import {
  corsHeaders,
  getActiveInterview,
  json,
  serviceClient,
} from "../_shared/active-interview.ts";

// Minimum new transcript chars since last suggestion before we'll fire again.
const SUGGEST_DELTA_CHARS = 5;
// Minimum wall-clock gap between suggestions, regardless of delta.
const SUGGEST_MIN_INTERVAL_MS = 1_000;

// deno-lint-ignore no-explicit-any
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

// Tokenize for fuzzy matching against transcription output. Contractions
// (don't, you're, it's, …) are dropped entirely — ASR transcripts render them
// inconsistently ("you're" vs "you are" vs "your") and they carry little signal
// for question identity anyway.
function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/\b[a-z]+'[a-z]+\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function levenshtein(a: string[], b: string[]): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array<number>(n + 1);
  let curr = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

// Fuzzy match: slide windows of roughly the question's length across the
// transcript and accept if any window is within ~30% edit distance. The
// ±2 slack on window size absorbs the interviewer adding or dropping a
// stray word ("So, um, what was your…").
function transcriptContainsQuestion(transcript: string, question: unknown) {
  if (typeof question !== "string") return false;
  const q = tokenize(question);
  if (q.length < 3) return false;
  const t = tokenize(transcript);
  const threshold = Math.max(1, Math.floor(q.length * 0.3));

  if (t.length < q.length) {
    return levenshtein(q, t) <= threshold;
  }

  const minWin = Math.max(1, q.length - 2);
  const maxWin = q.length + 2;
  for (let i = 0; i <= t.length - minWin; i++) {
    const wMax = Math.min(maxWin, t.length - i);
    for (let w = minWin; w <= wMax; w++) {
      if (levenshtein(q, t.slice(i, i + w)) <= threshold) return true;
    }
  }
  return false;
}

function fireSuggest() {
  const url = `${Deno.env.get(
    "SUPABASE_URL"
  )}/functions/v1/suggest-next-questions`;
  const p = fetch(url, { method: "POST" }).catch(() => {});
  if (typeof EdgeRuntime !== "undefined") {
    EdgeRuntime.waitUntil(p);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let body: { transcript?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const transcript = typeof body.transcript === "string" ? body.transcript : "";

  const db = serviceClient();

  try {
    const interview = await getActiveInterview(db);

    const { error } = await db
      .from("interviews")
      .update({ transcript })
      .eq("id", interview.id);
    if (error) throw error;

    const lastLen: number | null = interview.last_suggested_len ?? null;
    const lastAt: string | null = interview.last_suggested_at ?? null;
    const delta = transcript.length - (lastLen ?? 0);
    const ageMs = lastAt ? Date.now() - new Date(lastAt).getTime() : Infinity;

    // If the interviewer has actually asked one of the suggested questions
    // (it now shows up in the transcript), the current suggestions are spent —
    // re-suggest immediately and reset the debounce counters.
    const questionAsked =
      transcriptContainsQuestion(transcript, interview.deeper_question) ||
      transcriptContainsQuestion(transcript, interview.shift_question);

    const shouldSuggest =
      questionAsked ||
      lastLen === null ||
      (delta >= SUGGEST_DELTA_CHARS && ageMs >= SUGGEST_MIN_INTERVAL_MS);

    if (shouldSuggest) {
      // Mark immediately so concurrent process-transcript calls don't
      // double-fire while the LLM call is in flight.
      await db
        .from("interviews")
        .update({
          last_suggested_len: transcript.length,
          last_suggested_at: new Date().toISOString(),
        })
        .eq("id", interview.id);

      fireSuggest();
    }

    return json({ ok: true, interview_id: interview.id });
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
