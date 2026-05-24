// GET /get-interview-questions
// Returns the two most-recently-generated follow-up questions for the active
// interview. This is a cheap DB-only read — no LLM call. Questions are written
// by POST /suggest-next-questions, which should be called deliberately as the
// conversation progresses.
//   - shift_question   — pivots the conversation onto a fresh topic
//   - deeper_question  — drills further into what the subject just shared

import {
  corsHeaders,
  getActiveInterview,
  json,
  serviceClient,
} from "../_shared/active-interview.ts";

const FALLBACK = {
  shift_question: "Where'd you grow up?",
  deeper_question: "What'd that feel like?",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const db = serviceClient();
  try {
    const interview = await getActiveInterview(db);
    return json({
      ok: true,
      interview_id: interview.id,
      shift_question: interview.shift_question ?? FALLBACK.shift_question,
      deeper_question: interview.deeper_question ?? FALLBACK.deeper_question,
    });
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
