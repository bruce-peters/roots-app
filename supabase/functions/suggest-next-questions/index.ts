// POST /suggest-next-questions
// Reads the active interview's transcript and the subject's person record,
// calls Claude to generate two follow-up questions, then persists them onto
// the interview row so GET /get-interview-questions can return them cheaply.
//
// Call this deliberately several times during a session as the conversation
// evolves — not on every poll. Requires the ANTHROPIC_API_KEY secret.
//
// Response:
//   { ok, interview_id, deeper_question, shift_question }

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

interface Person {
  name: string | null;
  dob: string | null;
  place: string | null;
}

async function suggest(transcript: string, person: Person | null) {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return FALLBACK;

  const name = person?.name ?? "this person";
  const birthYear = person?.dob ? new Date(person.dob).getFullYear() : null;
  const age = birthYear ? new Date().getFullYear() - birthYear : null;
  const place = person?.place ?? null;
  const convo = transcript.trim() || "(the conversation has just begun — no transcript yet)";

  const system = `You are a compassionate guide helping an adult child record the life stories of their elderly loved one. Your sole job is to suggest follow-up interview questions that prompt long, vivid, story-rich responses — the kind of answers that go on for minutes, not seconds.

The best questions transport the person back to a specific moment and let them relive it: the smells, the faces, the feelings. You understand that elderly people carry decades of untold stories and respond beautifully to questions about specific people they loved, places that shaped them, and moments when their life changed direction.

You never ask closed questions. You never ask about health, decline, or regrets. You always make the person feel that their story matters enormously.`;

  const userMessage = `You are interviewing ${name}${birthYear ? `, born ${birthYear} (now approximately ${age} years old)` : ""}.
${place ? `Their life journey: ${place}.` : ""}

Transcript of the conversation so far:
---
${convo}
---

Suggest two follow-up questions. Return ONLY valid JSON, no other text:
{"deeper_question": "...", "shift_question": "..."}

CRITICAL: Each question must be 32 characters or fewer. Count carefully. Grammar can be telegraphic or abbreviated — e.g. "What'd home smell like then?" or "First job — how'd that start?" are fine.

== deeper_question ==
Go deeper into something already in the transcript.
- Pick the most emotionally loaded or specific detail mentioned
- Invite them to relive that moment — sensory, personal, named
- Keep it under 32 chars; cut every unnecessary word

== shift_question ==
Open a new chapter of their life not yet in the transcript.
- For someone born around ${birthYear ?? "in an earlier era"}: childhood home, school days, first job, meeting their partner, raising kids, a historical moment they witnessed, a friendship, a risk they took
- Keep it under 32 chars; telegraphic phrasing is fine`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: userMessage },
        ],
      }),
    });

    if (!res.ok) return FALLBACK;

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(text);
    return {
      shift_question: String(parsed.shift_question ?? FALLBACK.shift_question),
      deeper_question: String(parsed.deeper_question ?? FALLBACK.deeper_question),
    };
  } catch {
    return FALLBACK;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const db = serviceClient();
  try {
    const interview = await getActiveInterview(db);
    const transcript = typeof interview.transcript === "string" ? interview.transcript : "";

    const { data: person } = await db
      .from("people")
      .select("name, dob, place")
      .eq("id", interview.person_id)
      .maybeSingle();

    const questions = await suggest(transcript, person);

    const { error } = await db
      .from("interviews")
      .update({
        shift_question: questions.shift_question,
        deeper_question: questions.deeper_question,
      })
      .eq("id", interview.id);
    if (error) throw error;

    return json({ ok: true, interview_id: interview.id, ...questions });
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
