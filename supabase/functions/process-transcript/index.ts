// POST /process-transcript
// Body: { transcript: string }
// Replaces the full transcript text on the active interview.
// The device sends this periodically as transcription progresses,
// each call overwrites the previous text.

import {
  corsHeaders,
  getActiveInterview,
  json,
  serviceClient,
} from "../_shared/active-interview.ts";

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

    return json({ ok: true, interview_id: interview.id });
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
