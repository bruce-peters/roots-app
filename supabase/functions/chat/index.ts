// POST /chat
// Body: { personId?: string | null, messages: [{ role, content }] }
//
// Streams a Server-Sent Events response. First event is `sources` (JSON array
// of the chunks the LLM was given), followed by `delta` events as the model
// generates, then a final `done` event.
//
// Citations: the model is told to inline [c1], [c2]... where the index maps
// to the sources array. The client renders those as tap-targets that deep-link
// into the matching interview/memory/timeline screen.

import { corsHeaders, serviceClient } from "../_shared/active-interview.ts";

const EMBED_MODEL = "text-embedding-3-small";
const CHAT_MODEL = "gpt-4o";
const MATCH_COUNT = 8;

interface ChatMessage { role: "user" | "assistant" | "system"; content: string }
interface Source {
  n: number;                          // 1-based index used in [cN] citations
  kind: "transcript" | "memory" | "timeline";
  person_id: string;
  interview_id: string | null;
  ref_id: string | null;
  start_sec: number | null;
  end_sec: number | null;
  year: number | null;
  title: string | null;
  text: string;
  person_name: string | null;
}

async function embedQuery(apiKey: string, text: string): Promise<number[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: text }),
  });
  if (!res.ok) throw new Error(`Embedding ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.data[0].embedding;
}

function fmtTime(sec: number | null): string {
  if (sec == null) return "";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function buildContextBlock(sources: Source[]): string {
  return sources.map((s) => {
    const loc =
      s.kind === "transcript" ? `transcript ${fmtTime(s.start_sec)}` :
      s.kind === "memory"     ? `memory "${s.title ?? ""}"` :
                                `timeline ${s.year ?? ""}`;
    const who = s.person_name ? ` · ${s.person_name}` : "";
    return `[c${s.n}] (${loc}${who})\n${s.text}`;
  }).join("\n\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "OPENAI_API_KEY not set" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: { personId?: string | null; messages?: ChatMessage[] };
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "invalid json" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const personId = body.personId ?? null;
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser?.content?.trim()) {
    return new Response(JSON.stringify({ error: "no user message" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const db = serviceClient();

  // ── retrieve ──
  const queryEmbedding = await embedQuery(apiKey, lastUser.content);
  const { data: matches, error: mErr } = await db.rpc("match_chunks", {
    query_embedding: queryEmbedding,
    match_count: MATCH_COUNT,
    filter_person: personId,
  });
  if (mErr) {
    return new Response(JSON.stringify({ error: mErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Resolve person names for cross-person (global) chat.
  const personIds = Array.from(new Set((matches ?? []).map((m: { person_id: string }) => m.person_id)));
  const nameByPerson = new Map<string, string>();
  if (personIds.length) {
    const { data: peopleRows } = await db.from("people").select("id, name").in("id", personIds);
    for (const p of peopleRows ?? []) nameByPerson.set(p.id, p.name);
  }

  const sources: Source[] = (matches ?? []).map((m: {
    person_id: string; interview_id: string | null; kind: Source["kind"];
    ref_id: string | null; start_sec: number | null; end_sec: number | null;
    year: number | null; title: string | null; text: string;
  }, i: number) => ({
    n: i + 1,
    kind: m.kind,
    person_id: m.person_id,
    interview_id: m.interview_id,
    ref_id: m.ref_id,
    start_sec: m.start_sec,
    end_sec: m.end_sec,
    year: m.year,
    title: m.title,
    text: m.text,
    person_name: nameByPerson.get(m.person_id) ?? null,
  }));

  // ── prompt ──
  const subjectLine = personId && nameByPerson.size === 1
    ? `You are answering questions about ${[...nameByPerson.values()][0]}.`
    : `You are answering questions about the user's relatives across the Roots library.`;

  const system = `You are Roots — a warm, careful biographer helping someone explore stories their elderly relatives have told. ${subjectLine}

Ground every factual claim in the SOURCES below. If the sources don't answer the question, say so plainly — never invent details, names, dates, or quotes. When you reference something, append the citation tag [cN] (matching the source numbers) right after the relevant sentence. Multiple tags are fine: "She left Salerno in 1952 [c1][c3]."

Voice: serif-paragraph warm, never clinical. Quote the relative's own words when a source contains a vivid phrase — wrap quotes in normal double-quotes. Keep answers focused: 2–4 sentences for simple questions, longer only when the user clearly wants a story.

If a question is off-topic (not about the relatives or their lives), answer briefly and steer back.`;

  const contextBlock = sources.length
    ? `SOURCES\n\n${buildContextBlock(sources)}`
    : `SOURCES\n\n(none — no chunks indexed yet for this person. Tell the user there's nothing recorded yet.)`;

  const llmMessages = [
    { role: "system", content: system },
    { role: "system", content: contextBlock },
    ...messages.slice(-10), // keep recent turns for follow-ups
  ];

  // ── stream ──
  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (event: string, data: unknown) => {
        controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        send("sources", sources);

        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: CHAT_MODEL,
            stream: true,
            messages: llmMessages,
          }),
        });

        if (!res.ok || !res.body) {
          send("error", { message: `OpenAI ${res.status}` });
          controller.close();
          return;
        }

        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const raw of lines) {
            const line = raw.trim();
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (payload === "[DONE]") continue;
            try {
              const j = JSON.parse(payload);
              const delta = j.choices?.[0]?.delta?.content;
              if (typeof delta === "string" && delta.length) {
                send("delta", { text: delta });
              }
            } catch { /* ignore parse errors mid-chunk */ }
          }
        }

        send("done", { ok: true });
      } catch (e) {
        send("error", { message: String(e instanceof Error ? e.message : e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
});
