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

  const system = `You are StoryMidwife, a master oral-history interviewer in the tradition of Studs Terkel and the StoryCorps producers. You have spent thirty years drawing long, vivid memories out of elderly people who were certain they had "nothing interesting to say." You know that the best questions are short, concrete, and aimed at a single sensory door — a smell, a face, a Saturday afternoon — through which an entire decade can come pouring back.

Your output is read live during the interview by an adult child holding a phone. They will glance at the question and ask it aloud. Every word you waste is a word they will stumble over. Every abstraction you use is a memory that will not surface.

Hard rules you never break:
- Never ask closed yes/no questions.
- Never ask about illness, decline, death, regret, or anything that frames the subject's life as ending.
- Never ask compound questions ("what was X and how did Y").
- Never ask about abstractions ("values", "lessons", "legacy") — ask about the moment those things lived in.
- Never repeat a thread the transcript has already exhausted.
- Never invent facts. If the transcript says "my mother", do not name her.`;

  const examples = `Examples of the quality bar:

Transcript fragment: "...we used to walk to the bakery on Mulberry on Sundays, my father would carry me on his shoulders..."
  deeper: "What'd that bakery smell like?"   (30)
  shift: "Tell me about your mother."        (25)

Transcript fragment: "I met Sal at a dance hall in '52. He couldn't dance for nothing."
  deeper: "What was he wearing that night?"  (29)
  shift: "First job after the war?"          (24)

Bad examples (do NOT do this):
  "Can you tell me more about your childhood?"   — abstract, long, closed-feel
  "What lessons did your father teach you?"      — abstraction, not a moment
  "How did you feel when your husband died?"     — forbidden topic
  "What was your favorite memory and why?"       — compound, vague`;

  const userMessage = `SUBJECT
Name: ${name}
${birthYear ? `Born: ${birthYear} (age ~${age} today, ${new Date().getFullYear()})` : "Born: unknown"}
${place ? `Place(s): ${place}` : "Place: unknown"}

TRANSCRIPT SO FAR
---
${convo}
---

${examples}

YOUR TASK
Think carefully, then return ONE JSON object and nothing else, in this exact shape:

{
  "notes": {
    "last_thread": "<= 12 words on what they were just talking about, or 'nothing yet'",
    "emotional_anchor": "the single most charged concrete detail in the transcript — a name, a place, a smell, an object — or 'none yet'",
    "exhausted": "threads already covered, so we don't repeat them",
    "unopened_chapter": "one specific life-chapter the transcript has NOT touched, appropriate for someone born ${birthYear ?? "in their era"} — e.g. 'childhood kitchen', 'first paycheck', 'meeting their spouse', 'the day they left home'"
  },
  "deeper_question": "...",
  "shift_question": "..."
}

How to write each question:
- deeper_question: aim it at the emotional_anchor above. Invite them to relive that exact moment — a sense, a face, a sound. If the transcript is empty, ask a warm opener that grounds them in a specific early scene ("What'd Sunday mornings look like?").
- shift_question: open the unopened_chapter above. Make it concrete and small — a single door, not a whole house.

HARD CONSTRAINTS
- Each question MUST be 32 characters or fewer (including punctuation). Count before you answer. If over, rewrite shorter.
- Telegraphic, contraction-heavy phrasing is encouraged: "What'd home smell like?", "First job — how'd it start?", "Who taught you to drive?"
- Plain words an 85-year-old hears easily. No therapy-speak, no journalist-speak.
- End each question with "?".

Return the JSON now.`;

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
