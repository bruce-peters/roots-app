// Helpers shared across edge functions. All functions operate on the single
// interview row with active=true (the "current" session the box is recording).

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

export async function getActiveInterview(db: SupabaseClient) {
  const { data, error } = await db
    .from("interviews")
    .select("*")
    .eq("active", true)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("no active interview");
  return data;
}

// All functions have verify_jwt = false — no API key is required from callers.
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
