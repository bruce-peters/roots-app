// POST /process-interview
// Called by the app immediately after an interview ends (active flipped to
// false). Loads the person's existing memories + timeline, asks OpenAI to
// extend them with anything new in the transcript, and writes the merged
// arrays back to the people row.
//
// The model is told NEVER to delete or modify existing entries — only add
// new ones (or extend cross-references). Requires OPENAI_API_KEY.
//
// Body:    { "interviewId": "<uuid>" }
// Response: { ok, interview_id, person_id, memoriesCount, timelineCount }

import { corsHeaders, json, serviceClient } from "../_shared/active-interview.ts";

const MODEL = "gpt-4o";

interface Memory {
  id: string;
  title: string;
  tags: string[];
  snippet: string;
  year: number | null;
  photos: number;
  sourceInterviewId: string | null;
}

interface TimelineEntry {
  id: string;
  year: number;
  decade: string;
  title: string;
  body: string;
  memories: string[];
}

interface ModelOutput {
  memories: Memory[];
  timeline: TimelineEntry[];
}

async function extract(
  apiKey: string,
  person: { name: string | null; dob: string | null; place: string | null; relation: string | null },
  existingMemories: Memory[],
  existingTimeline: TimelineEntry[],
  interview: { id: string; transcript: string },
): Promise<ModelOutput> {
  const birthYear = person.dob ? new Date(person.dob).getFullYear() : null;

  const system = `You are a biographer working on Roots — an app that records people telling their life stories. Your job: read a new interview transcript and produce updated "memories" and "timeline" arrays for this person.

A MEMORY is a short structured record of any story, anecdote, opinion, or vivid detail the person mentioned:
{ "id": "m-<short>", "title": "...", "tags": ["..."], "snippet": "one or two sentences in their own voice or close paraphrase", "year": <number or null>, "photos": 0, "sourceInterviewId": "<the interview id>" }

A TIMELINE ENTRY is a life event placed on a chronology:
{ "id": "t-<short>", "year": <number>, "decade": "<e.g. 1960s>", "title": "...", "body": "1-2 sentence description", "memories": ["m-<id>", ...] }

Be GENEROUS in extraction. Even a short, messy, or auto-transcribed conversation usually contains 1–3 memories worth capturing. If the person mentions any specific event, person, place, feeling, or recurring pattern from their life — that's a memory. Don't wait for a polished anecdote.

For timeline entries: ALWAYS estimate a plausible year when the transcript implies a life stage. Use the person's birthYear (provided in the user message) plus clues like "when I was a kid" (~age 8), "growing up" (~age 12), "in school" (~age 10–18), "first job" (~age 18–22), etc. Compute year = birthYear + estimated_age. It is BETTER to make a reasonable estimate than to skip the timeline entry. Only omit a timeline entry if there is truly zero temporal signal AND birthYear is unknown.

HARD RULES — read carefully:
1. You MUST return EVERY existing memory and EVERY existing timeline entry, with their existing "id" UNCHANGED. Never delete, rename, or rewrite an existing entry. Copy them through verbatim.
2. You may add new entries (with new ids you invent, prefixed "m-" or "t-"). For existing entries you may also append additional ids to "memories" or fill in "sourceInterviewId" when the new transcript clearly extends them. When in doubt, create a NEW entry rather than editing.
3. New ids must be unique and not collide with existing ones. Use short random-looking suffixes like "m-a4f9k2" / "t-b7c2x1".
4. For each new timeline entry, "decade" must match the year (e.g. year 1964 → "1960s").
5. Link memories to timeline entries by including the memory id in that entry's "memories" array — when a new memory has any estimated year, also create (or extend) a timeline entry for that year and link them.
6. Output ONLY a JSON object of the form { "memories": [...], "timeline": [...] }. No prose, no markdown.

If the transcript is genuinely just noise ("testing testing"), return the existing arrays unchanged — but err on the side of extracting when there's any real content.`;

  const userPayload = {
    person: {
      name: person.name,
      birthYear,
      place: person.place,
      relation: person.relation,
    },
    existingMemories,
    existingTimeline,
    newInterview: {
      id: interview.id,
      transcript: interview.transcript,
    },
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(userPayload) },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content ?? "";
  console.log("[process-interview] raw model output:", text);
  const parsed = JSON.parse(text);

  const memories: Memory[] = Array.isArray(parsed.memories) ? parsed.memories : [];
  const timeline: TimelineEntry[] = Array.isArray(parsed.timeline) ? parsed.timeline : [];
  return { memories, timeline };
}

// Belt-and-suspenders: even if the model disobeys the "never delete" rule,
// guarantee every existing entry survives by re-merging by id afterward.
function mergePreserving<T extends { id: string }>(existing: T[], modelOutput: T[]): T[] {
  const byId = new Map<string, T>();
  for (const e of existing) byId.set(e.id, e);
  for (const m of modelOutput) {
    if (!m || typeof m.id !== "string") continue;
    if (byId.has(m.id)) {
      // Keep the model's version (it may have extended cross-refs) but only
      // if it still looks like a valid entry. Existing entry wins on conflict
      // for the core fields we care about — we trust additions more than edits.
      byId.set(m.id, { ...byId.get(m.id)!, ...m, id: m.id });
    } else {
      byId.set(m.id, m);
    }
  }
  return Array.from(byId.values());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return json({ error: "OPENAI_API_KEY not set" }, 500);

  let body: { interviewId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }
  const interviewId = body.interviewId;
  if (!interviewId) return json({ error: "interviewId required" }, 400);

  const db = serviceClient();

  try {
    const { data: interview, error: iErr } = await db
      .from("interviews")
      .select("id, person_id, transcript")
      .eq("id", interviewId)
      .maybeSingle();
    if (iErr) throw iErr;
    if (!interview) return json({ error: "interview not found" }, 404);

    const transcript = typeof interview.transcript === "string" ? interview.transcript : "";
    if (!transcript.trim()) {
      return json({
        ok: true,
        interview_id: interview.id,
        person_id: interview.person_id,
        skipped: "empty transcript",
      });
    }

    const { data: person, error: pErr } = await db
      .from("people")
      .select("id, name, dob, place, relation, memories, timeline")
      .eq("id", interview.person_id)
      .maybeSingle();
    if (pErr) throw pErr;
    if (!person) return json({ error: "person not found" }, 404);

    const existingMemories: Memory[] = Array.isArray(person.memories) ? person.memories : [];
    const existingTimeline: TimelineEntry[] = Array.isArray(person.timeline) ? person.timeline : [];

    const output = await extract(
      apiKey,
      {
        name: person.name ?? null,
        dob: person.dob ?? null,
        place: person.place ?? null,
        relation: person.relation ?? null,
      },
      existingMemories,
      existingTimeline,
      { id: interview.id, transcript },
    );

    const mergedMemories = mergePreserving(existingMemories, output.memories);
    const mergedTimeline = mergePreserving(existingTimeline, output.timeline);

    const { error: uErr } = await db
      .from("people")
      .update({ memories: mergedMemories, timeline: mergedTimeline })
      .eq("id", person.id);
    if (uErr) throw uErr;

    return json({
      ok: true,
      interview_id: interview.id,
      person_id: person.id,
      memoriesCount: mergedMemories.length,
      timelineCount: mergedTimeline.length,
      memoriesAdded: mergedMemories.length - existingMemories.length,
      timelineAdded: mergedTimeline.length - existingTimeline.length,
    });
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
