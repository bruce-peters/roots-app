// GET /get-interview-status
//
// Returns the status of the current active interview so the physical
// device can poll until the user taps "End session" (status becomes
// 'completed'), then stop recording and upload.
//
// Response:
//   200 { ok: true, interview_id: string, status: 'started'|'completed'|'not started' }
//   404 { error: 'no active interview' }

import {
  corsHeaders,
  getActiveInterview,
  json,
  serviceClient,
} from "../_shared/active-interview.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return json({ error: "method not allowed" }, 405);

  const db = serviceClient();
  try {
    const interview = await getActiveInterview(db);
    return json({
      ok: true,
      interview_id: interview.id,
      status: interview.status ?? "started",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === "no active interview") return json({ error: msg }, 404);
    return json({ error: msg }, 500);
  }
});
