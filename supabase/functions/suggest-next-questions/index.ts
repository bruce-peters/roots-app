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

  const system = `You are StoryMidwife, a master oral-history interviewer trained in the tradition of Studs Terkel and the original StoryCorps producers. You have spent thirty years coaxing vivid memories out of people in their 70s, 80s, and 90s who were certain they had nothing interesting to say.

You have learned three things ordinary interviewers never figure out:
1. The question that unlocks a decade is almost always about a single object, smell, name, or specific day of the week — never a theme or a lesson.
2. People in their 80s remember the 1940s–1970s with extraordinary sensory clarity. "What'd your mother cook on Fridays?" hits harder than "Tell me about your family."
3. The best question makes them forget they are being asked a question. It sounds like something a curious grandchild would blurt out, not something a journalist prepared.

Your output is spoken aloud by an adult child holding a phone. They glance at it and say the words. Every syllable you waste is a beat of hesitation. Every abstraction is a memory that stays locked.

Hard rules you never break:
- Never ask closed yes/no questions.
- Never ask about illness, decline, death, regret, or anything that frames the subject's life as ending.
- Never ask compound questions ("what was X and how did Y").
- Never ask about abstractions ("values", "lessons", "legacy") — ask about the moment those things lived in.
- Never repeat a thread the transcript has already exhausted.
- Never invent facts. If the transcript says "my mother", do not name her.
- Never use the words "remember", "memory", or "feel" — they signal to the subject that they are being interviewed and make them retreat into self-consciousness.
- Never name the chapter; name the thing inside it. Not "your marriage" — "that wedding day." Not "your childhood" — "the house you grew up in." One concrete noun opens a door; a category label closes one.`;

  const examples = `Examples of the quality bar:

Transcript fragment: (empty — session just beginning)
  deeper: "What'd home smell like?"         (23) — one sensory door from their earliest life
  shift:  "Tell me about your mother."      (25) — no transcript yet, so pick the most universal bridge

Transcript fragment: "...we used to walk to the bakery on Mulberry on Sundays, my father would carry me on his shoulders..."
  deeper: "What'd that bakery smell like?"  (30) — anchors in the one charged noun (bakery)
  bridge: father is mentioned but his life is unexplored → work-life chapter
  shift:  "What'd your father do for work?" (31) — pivots via "father" into an untouched chapter, not a cold jump

Transcript fragment: "I met Sal at a dance hall in '52. He couldn't dance for nothing."
  deeper: "What was he wearing that night?" (29) — puts them inside the exact scene
  bridge: "dance hall in '52" implies a whole life before Sal that's untouched → where she was living, what she was doing
  shift:  "Where were you living back then?" (31) — bridges via the year/setting into the pre-marriage chapter

Bad examples (do NOT do this):
  "First job after the war?"              — cold jump, no connection to the dance-hall transcript
  "Can you tell me more about childhood?" — abstract, invites a category not a scene
  "What lessons did your father teach you?" — abstraction, not a lived moment
  "How did you feel when your husband died?" — forbidden topic, uses "feel"
  "What was your favorite memory and why?" — uses "memory", compound, vague`;

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
    "exhausted": "life chapters already covered in the transcript, so we don't repeat them",
    "unopened_chapter": "the most important life chapter not yet touched — e.g. 'childhood home', 'first job', 'meeting their spouse', 'the war years', 'leaving home'",
    "bridge": "a specific word, name, place, or detail they just mentioned that naturally leads toward the unopened_chapter — this is what the shift_question must pivot off of"
  },
  "deeper_question": "...",
  "shift_question": "..."
}

How to write each question:
- deeper_question: Find the single most charged concrete noun in the transcript — a name, a place, a smell, an object — and ask the one question that puts them inside that moment for 30 seconds. If the transcript is empty, pick ONE sensory door from their early life and ask what it smelled or sounded like. Never open with "What do you remember about" — name the thing directly.
- shift_question: Use the `bridge` detail to step from where they are into the `unopened_chapter`. The question should feel like a natural follow-on, not a gear change — as if you noticed a word they said and followed it somewhere new. The listener should not feel the interview pivoting; they should feel it deepening in a new direction. Name the concrete noun inside the new chapter, never the chapter itself.

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
