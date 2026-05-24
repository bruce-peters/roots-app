// POST /process-interview
// Body: { "interviewId": "<uuid>" }
//
// 1. If the interview has a video URL, fetches it and sends the audio to
//    Whisper (verbose_json + word timestamps). Writes the cleaner transcript
//    and word-timing array back to the interviews row.
// 2. Calls GPT-4o to extract/update memories and timeline entries.
//    When word timestamps are available the model returns a "clips" array
//    for each new memory — one { start, end } pair per occurrence in the session.
//    Clips within 3 s of each other are merged before writing to the DB.
// 3. Writes merged memories + timeline back to the person row.
//
// Requires OPENAI_API_KEY.

import { corsHeaders, json, serviceClient } from "../_shared/active-interview.ts";

const MODEL = "gpt-4o";

// deno-lint-ignore no-explicit-any
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

// Fire-and-forget reindex so the chat screen sees fresh content.
function fireEmbedPerson(personId: string) {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/embed-person`;
  const p = fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ personId }),
  }).catch(() => {});
  if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(p);
}

interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

interface Clip {
  start: number;
  end: number;
}

interface Memory {
  id: string;
  title: string;
  tags: string[];
  snippet: string;
  year: number | null;
  photos: number;
  sourceInterviewId: string | null;
  // All time-ranges (seconds) in the source interview where this memory is discussed.
  // Multiple entries when the subject comes up more than once; adjacent clips ≤3 s
  // apart are merged by mergeClips() before being written to the DB.
  clips: Clip[];
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

// Fetch video, send to Whisper, return text + word timestamps.
async function transcribeWithTimestamps(
  apiKey: string,
  videoUrl: string,
): Promise<{ text: string; words: WordTimestamp[] }> {
  const videoResp = await fetch(videoUrl);
  if (!videoResp.ok) throw new Error(`Failed to fetch video: ${videoResp.status}`);
  const videoBlob = await videoResp.blob();

  const form = new FormData();
  form.append("file", videoBlob, "interview.mp4");
  form.append("model", "whisper-1");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Whisper ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const text: string = data.text ?? "";
  const rawWords: WordTimestamp[] = Array.isArray(data.words)
    ? data.words.map((w: { word: string; start: number; end: number }) => ({
        word: w.word,
        start: w.start,
        end: w.end,
      }))
    : [];
  // Re-attach punctuation stripped by Whisper's word tokeniser.
  const words = reattachPunctuation(text, rawWords);
  return { text, words };
}

/**
 * Whisper word tokens omit trailing punctuation. This walks the full
 * transcript text (which does have punctuation) and re-attaches any
 * punctuation that immediately follows each word.
 *
 * e.g. text="Hello, world!"  words=["Hello","world"]
 *    → ["Hello,", "world!"]
 *
 * Apostrophes mid-word (contractions, possessives) are left alone because
 * the lookahead requires punctuation to be followed by whitespace or end-of-
 * string before we capture it.
 */
function reattachPunctuation(text: string, words: WordTimestamp[]): WordTimestamp[] {
  if (!words.length) return words;

  // Matches trailing punctuation only when followed by whitespace or end-of-string,
  // so apostrophes inside contractions ("don't") are never captured.
  const TRAILING = /^([.,!?;:…)\]}"'—–]+)(?=\s|$)/;

  let cursor = 0;
  const textLower = text.toLowerCase();

  return words.map((w) => {
    const bare = w.word.trim();
    if (!bare) return w;

    const idx = textLower.indexOf(bare.toLowerCase(), cursor);
    if (idx === -1) return { ...w, word: bare };

    cursor = idx + bare.length;

    const punctMatch = text.slice(cursor).match(TRAILING);
    const punct = punctMatch ? punctMatch[1] : "";
    if (punct) cursor += punct.length;

    return { ...w, word: bare + punct };
  });
}

// Compact encoding: "hello@0.12 world@0.47 ..." — one token per word with start time.
function encodeWords(words: WordTimestamp[]): string {
  return words.map((w) => `${w.word}@${w.start.toFixed(2)}`).join(" ");
}

/**
 * Merge adjacent/overlapping clip segments. Any two clips whose gap
 * (next.start − prev.end) is ≤ gapSeconds are joined into one range.
 * Mirrors the frontend mergeClips utility in src/lib/utils.js.
 */
function mergeClips(clips: Clip[], gapSeconds = 3): Clip[] {
  if (!clips.length) return [];
  const sorted = [...clips].sort((a, b) => a.start - b.start);
  const merged: Clip[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    if (sorted[i].start - last.end <= gapSeconds) {
      last.end = Math.max(last.end, sorted[i].end);
    } else {
      merged.push({ ...sorted[i] });
    }
  }
  return merged;
}

async function extract(
  apiKey: string,
  person: { name: string | null; dob: string | null; place: string | null; relation: string | null },
  existingMemories: Memory[],
  existingTimeline: TimelineEntry[],
  interview: { id: string; transcript: string },
  transcriptWords: WordTimestamp[],
): Promise<ModelOutput> {
  const birthYear = person.dob ? new Date(person.dob).getFullYear() : null;
  const hasTimestamps = transcriptWords.length > 0;

  const system = `You are a biographer working on Roots — an app that records people telling their life stories. Your job: read a new interview transcript and produce updated "memories" and "timeline" arrays for this person.

A MEMORY is a short structured record of any story, anecdote, opinion, or vivid detail the person mentioned:
{ "id": "m-<short>", "title": "...", "tags": ["..."], "snippet": "one or two sentences in their own voice or close paraphrase", "year": <number or null>, "photos": 0, "sourceInterviewId": "<the interview id>", "clips": [{ "start": <seconds>, "end": <seconds> }, ...] }

A TIMELINE ENTRY is a life event placed on a chronology:
{ "id": "t-<short>", "year": <number>, "decade": "<e.g. 1960s>", "title": "...", "body": "1-2 sentence description", "memories": ["m-<id>", ...] }

Be GENEROUS in extraction. Even a short, messy, or auto-transcribed conversation usually contains 1–3 memories worth capturing. If the person mentions any specific event, person, place, feeling, or recurring pattern from their life — that's a memory. Don't wait for a polished anecdote.

For timeline entries: ALWAYS estimate a plausible year when the transcript implies a life stage. Use the person's birthYear (provided in the user message) plus clues like "when I was a kid" (~age 8), "growing up" (~age 12), "in school" (~age 10–18), "first job" (~age 18–22), etc. Compute year = birthYear + estimated_age. It is BETTER to make a reasonable estimate than to skip the timeline entry. Only omit a timeline entry if there is truly zero temporal signal AND birthYear is unknown.

  ${hasTimestamps ? `WORD TIMESTAMPS: The user message includes a compact word-timestamp string in the form "word@start_seconds ...". For each NEW memory you add, find EVERY span of words in the session where that memory is discussed and record each span as a separate clip. A memory may surface multiple times in one session — capture all occurrences. For each clip: set "start" to the start time of the first word in the span and "end" to the start time of the last word in the span plus ~0.5 s so the sentence finishes cleanly. Round to two decimal places. If you cannot locate the relevant words, set "clips" to [].` : `No word timestamps are available for this interview. Set "clips" to [] for all entries.`}

HARD RULES — read carefully:
1. You MUST return EVERY existing memory and EVERY existing timeline entry, with their existing "id" UNCHANGED. Never delete, rename, or rewrite an existing entry. Copy them through verbatim (including their existing "clips" arrays).
2. You may add new entries (with new ids you invent, prefixed "m-" or "t-"). For existing entries you may also append additional ids to "memories" or fill in "sourceInterviewId" when the new transcript clearly extends them. When in doubt, create a NEW entry rather than editing.
3. New ids must be unique and not collide with existing ones. Use short random-looking suffixes like "m-a4f9k2" / "t-b7c2x1".
4. For each new timeline entry, "decade" must match the year (e.g. year 1964 → "1960s").
5. Link memories to timeline entries by including the memory id in that entry's "memories" array — when a new memory has any estimated year, also create (or extend) a timeline entry for that year and link them.
6. Output ONLY a JSON object of the form { "memories": [...], "timeline": [...] }. No prose, no markdown.

If the transcript is genuinely just noise ("testing testing"), return the existing arrays unchanged — but err on the side of extracting when there's any real content.`;

  const userPayload: Record<string, unknown> = {
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

  if (hasTimestamps) {
    userPayload.transcriptWordTimestamps = encodeWords(transcriptWords);
  }

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

  const memories: Memory[] = Array.isArray(parsed.memories)
    ? parsed.memories.map((m: Memory) => ({
        ...m,
        // Normalise: ensure clips is always an array and merge close segments.
        clips: mergeClips(Array.isArray(m.clips) ? m.clips : []),
      }))
    : [];
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
      .select("id, person_id, transcript, transcript_words, video")
      .eq("id", interviewId)
      .maybeSingle();
    if (iErr) throw iErr;
    if (!interview) return json({ error: "interview not found" }, 404);

    let transcript: string = typeof interview.transcript === "string" ? interview.transcript : "";
    let transcriptWords: WordTimestamp[] = Array.isArray(interview.transcript_words)
      ? (interview.transcript_words as WordTimestamp[])
      : [];

    // ── Whisper step ─────────────────────────────────────────────────────────
    const videoUrl: string | null = typeof interview.video === "string" ? interview.video : null;
    if (videoUrl && transcriptWords.length === 0) {
      try {
        console.log("[process-interview] calling Whisper for interview", interviewId);
        const whisper = await transcribeWithTimestamps(apiKey, videoUrl);
        transcript = whisper.text || transcript;
        transcriptWords = whisper.words;

        const { error: wErr } = await db
          .from("interviews")
          .update({ transcript, transcript_words: transcriptWords })
          .eq("id", interviewId);
        if (wErr) console.error("[process-interview] failed to save word timestamps:", wErr);
        else console.log("[process-interview] Whisper done,", transcriptWords.length, "words");
      } catch (e) {
        console.error("[process-interview] Whisper failed, falling back to streamed transcript:", e);
        // transcriptWords stays [] — GPT will receive no timestamps
      }
    }

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
      transcriptWords,
    );

    const mergedMemories = mergePreserving(existingMemories, output.memories);
    const mergedTimeline = mergePreserving(existingTimeline, output.timeline);

    const { error: uErr } = await db
      .from("people")
      .update({ memories: mergedMemories, timeline: mergedTimeline })
      .eq("id", person.id);
    if (uErr) throw uErr;

    // Reindex chunks for this person in the background — chat RAG depends on it.
    fireEmbedPerson(person.id);

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
