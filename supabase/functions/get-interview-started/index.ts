// GET /get-interview-started
// Returns { started: boolean } for the active interview. The recording box
// polls this so it can power up its lights/motors when the app flips the
// session to "started".

import {
  corsHeaders,
  getActiveInterview,
  json,
  serviceClient,
} from "../_shared/active-interview.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const db = serviceClient();
  try {
    const interview = await getActiveInterview(db);
    return json({
      ok: true,
      interview_id: interview.id,
      started: !!interview.started,
    });
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
