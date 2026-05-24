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
// ~1000 chars is roughly 2–3 minutes of elderly speech.
const SUGGEST_DELTA_CHARS = 1000;
// Minimum wall-clock gap between suggestions, regardless of delta.
const SUGGEST_MIN_INTERVAL_MS = 45_000;

// deno-lint-ignore no-explicit-any
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

function fireSuggest() {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/suggest-next-questions`;
  const p = fetch(url, { method: "POST" }).catch(() => {});
  if (typeof EdgeRuntime !== "undefined") {
    EdgeRuntime.waitUntil(p);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
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

    const shouldSuggest =
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
