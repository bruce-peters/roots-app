// POST /upload-video
// Body: multipart/form-data with a single `file` field (the full session video).
// Uploads to the `interview-videos` storage bucket and saves the public URL
// onto the active interview's `video` column. Also flips `active` off so the
// session is considered closed.
//
// After the row is updated, fires process-interview as a background task so
// Whisper alignment + memory extraction run automatically once the video lands.

import {
  corsHeaders,
  getActiveInterview,
  json,
  serviceClient,
} from "../_shared/active-interview.ts";

// deno-lint-ignore no-explicit-any
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return json({ error: "expected multipart form with `file` field" }, 400);
  }

  const db = serviceClient();

  try {
    const interview = await getActiveInterview(db);
    const ext = file.name.split(".").pop() || "mp4";
    const path = `${interview.id}/${Date.now()}.${ext}`;

    const { error: upErr } = await db.storage
      .from("interview-videos")
      .upload(path, file.stream(), {
        contentType: file.type || "video/mp4",
        upsert: true,
      });
    if (upErr) throw upErr;

    const { data: pub } = db.storage.from("interview-videos").getPublicUrl(path);

    const { error: updErr } = await db
      .from("interviews")
      .update({ video: pub.publicUrl, status: "completed" })
      .eq("id", interview.id);
    if (updErr) throw updErr;

    // Trigger process-interview in the background now that both the transcript
    // and the video file are in place. Returns immediately to the device.
    const processUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/process-interview`;
    const p = fetch(processUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interviewId: interview.id }),
    }).catch(() => {});
    if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(p);

    return json({ ok: true, interview_id: interview.id, video: pub.publicUrl });
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
