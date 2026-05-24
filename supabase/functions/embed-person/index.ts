// POST /embed-person
// Body: { personId: string }
//
// Rebuilds the chunks table for a single person:
//   - One chunk per memory       (title + snippet, anchored to first clip)
//   - One chunk per timeline entry
//   - Many chunks per transcript (~30-second windows from transcript_words,
//     or ~600-char windows when no word timestamps exist)
//
// Embeddings use text-embedding-3-small (1536 dim). Idempotent: deletes the
// person's existing chunks before inserting fresh ones.
//
// Called fire-and-forget at the tail of process-interview and on demand from
// the frontend (when the chat screen finds no chunks for a person).

import { corsHeaders, json, serviceClient } from "../_shared/active-interview.ts";

const EMBED_MODEL = "text-embedding-3-small";
const TRANSCRIPT_WINDOW_SEC = 30;
const TRANSCRIPT_CHAR_WINDOW = 600;
const EMBED_BATCH = 96;

interface WordTimestamp { word: string; start: number; end: number }
interface Clip { start: number; end: number }
interface Memory {
  id: string; title?: string; snippet?: string; tags?: string[];
  year?: number | null; sourceInterviewId?: string | null; clips?: Clip[];
}
interface TimelineEntry {
  id: string; year: number; decade?: string; title?: string; body?: string;
}
interface ChunkRow {
  person_id: string;
  interview_id: string | null;
  kind: "transcript" | "memory" | "timeline";
  ref_id: string | null;
  start_sec: number | null;
  end_sec: number | null;
  year: number | null;
  title: string | null;
  text: string;
  embedding?: number[];
}

function chunkTranscriptByWords(words: WordTimestamp[]): { start: number; end: number; text: string }[] {
  if (!words.length) return [];
  const out: { start: number; end: number; text: string }[] = [];
  let bucket: WordTimestamp[] = [];
  let bucketStart = words[0].start;
  for (const w of words) {
    if (w.start - bucketStart >= TRANSCRIPT_WINDOW_SEC && bucket.length > 0) {
      out.push({
        start: bucket[0].start,
        end: bucket[bucket.length - 1].end,
        text: bucket.map((b) => b.word).join(" "),
      });
      bucket = [];
      bucketStart = w.start;
    }
    bucket.push(w);
  }
  if (bucket.length) {
    out.push({
      start: bucket[0].start,
      end: bucket[bucket.length - 1].end,
      text: bucket.map((b) => b.word).join(" "),
    });
  }
  return out;
}

function chunkTranscriptByText(text: string): string[] {
  const clean = text.trim();
  if (!clean) return [];
  const out: string[] = [];
  for (let i = 0; i < clean.length; i += TRANSCRIPT_CHAR_WINDOW) {
    out.push(clean.slice(i, i + TRANSCRIPT_CHAR_WINDOW));
  }
  return out;
}

async function embedBatch(apiKey: string, inputs: string[]): Promise<number[][]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: inputs }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI embeddings ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.data.map((d: { embedding: number[] }) => d.embedding);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) return json({ error: "OPENAI_API_KEY not set" }, 500);

  let body: { personId?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid json" }, 400); }
  const personId = body.personId;
  if (!personId) return json({ error: "personId required" }, 400);

  const db = serviceClient();

  try {
    const { data: person, error: pErr } = await db
      .from("people")
      .select("id, name, memories, timeline")
      .eq("id", personId)
      .maybeSingle();
    if (pErr) throw pErr;
    if (!person) return json({ error: "person not found" }, 404);

    const { data: interviewRows, error: iErr } = await db
      .from("interviews")
      .select("id, time, transcript, transcript_words")
      .eq("person_id", personId)
      .order("time", { ascending: true });
    if (iErr) throw iErr;

    const memories: Memory[] = Array.isArray(person.memories) ? person.memories : [];
    const timeline: TimelineEntry[] = Array.isArray(person.timeline) ? person.timeline : [];

    const rows: ChunkRow[] = [];

    // ── memories ──
    for (const m of memories) {
      const tagStr = Array.isArray(m.tags) && m.tags.length ? ` (${m.tags.join(", ")})` : "";
      const text = `Memory — ${m.title ?? "Untitled"}${m.year ? ` [${m.year}]` : ""}${tagStr}: ${m.snippet ?? ""}`.trim();
      if (!text) continue;
      const firstClip = Array.isArray(m.clips) && m.clips.length ? m.clips[0] : null;
      rows.push({
        person_id: personId,
        interview_id: m.sourceInterviewId ?? null,
        kind: "memory",
        ref_id: m.id,
        start_sec: firstClip?.start ?? null,
        end_sec: firstClip?.end ?? null,
        year: m.year ?? null,
        title: m.title ?? null,
        text,
      });
    }

    // ── timeline ──
    for (const t of timeline) {
      const text = `Timeline ${t.year} — ${t.title ?? ""}: ${t.body ?? ""}`.trim();
      if (!text || text.length < 8) continue;
      rows.push({
        person_id: personId,
        interview_id: null,
        kind: "timeline",
        ref_id: t.id,
        start_sec: null,
        end_sec: null,
        year: t.year ?? null,
        title: t.title ?? null,
        text,
      });
    }

    // ── transcripts ──
    for (const iv of interviewRows ?? []) {
      const date = iv.time
        ? new Date(iv.time).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" })
        : "session";
      const label = `Session ${date}`;
      const words: WordTimestamp[] = Array.isArray(iv.transcript_words) ? iv.transcript_words : [];
      if (words.length) {
        for (const w of chunkTranscriptByWords(words)) {
          if (!w.text.trim()) continue;
          rows.push({
            person_id: personId,
            interview_id: iv.id,
            kind: "transcript",
            ref_id: null,
            start_sec: w.start,
            end_sec: w.end,
            year: null,
            title: label,
            text: w.text,
          });
        }
      } else if (typeof iv.transcript === "string" && iv.transcript.trim()) {
        for (const piece of chunkTranscriptByText(iv.transcript)) {
          rows.push({
            person_id: personId,
            interview_id: iv.id,
            kind: "transcript",
            ref_id: null,
            start_sec: null,
            end_sec: null,
            year: null,
            title: label,
            text: piece,
          });
        }
      }
    }

    if (rows.length === 0) {
      // Still wipe old chunks so deletes propagate.
      await db.from("chunks").delete().eq("person_id", personId);
      return json({ ok: true, person_id: personId, chunks: 0 });
    }

    // Embed in batches.
    for (let i = 0; i < rows.length; i += EMBED_BATCH) {
      const slice = rows.slice(i, i + EMBED_BATCH);
      const vectors = await embedBatch(apiKey, slice.map((r) => r.text));
      slice.forEach((r, j) => { r.embedding = vectors[j]; });
    }

    // Atomic-ish swap: delete old, insert new.
    const { error: delErr } = await db.from("chunks").delete().eq("person_id", personId);
    if (delErr) throw delErr;

    // pgrest can choke on huge inserts — chunk to 200 rows.
    for (let i = 0; i < rows.length; i += 200) {
      const { error: insErr } = await db.from("chunks").insert(rows.slice(i, i + 200));
      if (insErr) throw insErr;
    }

    return json({ ok: true, person_id: personId, chunks: rows.length });
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
