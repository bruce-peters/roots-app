// GET /get-interview-questions
// Looks at the active interview's transcript so far and returns two suggested
// follow-up questions:
//   - shift_question   — pivots the conversation onto a fresh topic
//   - deeper_question  — drills further into what the subject just shared
// Both are persisted onto the active interview row so the device / app can
// read the latest suggestions without re-calling the LLM.

import {
  corsHeaders,
  getActiveInterview,
  json,
  serviceClient,
} from "../_shared/active-interview.ts";

const FALLBACK = {
  shift_question: "Tell me about where you grew up — what was your neighborhood like?",
  deeper_question: "What did that moment feel like for you at the time?",
};

async function suggest(transcript: Array<{ question: string; response: string }>) {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return FALLBACK;

  const convo = transcript
    .map((e) => `Q: ${e.question}\nA: ${e.response}`)
    .join("\n\n") || "(no questions asked yet)";

  const prompt = `You are helping an interviewer record stories from an elderly loved one.
Given the conversation so far, suggest two next questions:
1. "shift_question": gently pivots to a new topic or life chapter.
2. "deeper_question": follows up on the most recent answer to draw out detail or emotion.
Return JSON: {"shift_question": "...", "deeper_question": "..."}.

Conversation so far:
${convo}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) return FALLBACK;
  const data = await res.json();
  try {
    const parsed = JSON.parse(data.choices[0].message.content);
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

  const db = serviceClient();
  try {
    const interview = await getActiveInterview(db);
    const transcript = Array.isArray(interview.transcript) ? interview.transcript : [];
    const questions = await suggest(transcript);

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
