-- DB trigger: call process-interview edge function when interviews.video is set.
--
-- Replaces the manual fetch() call in upload-video.  The trigger fires after
-- the device's upload-video edge function writes the video URL to the row,
-- keeping the triggering logic out of application code and ensuring it runs
-- even if the video column is set by any other path in the future.
--
-- Prerequisites (run once per environment after deploying):
--   alter database postgres
--     set app.settings.supabase_url = 'https://<your-ref>.supabase.co';
--
-- For local Supabase dev the fallback below (http://kong:8000) is used
-- automatically when the setting is absent or empty.

-- pg_net ships with Supabase; this is a no-op if already enabled.
create extension if not exists pg_net with schema extensions;

-- ── Trigger function ──────────────────────────────────────────────────────────

create or replace function public.interviews_on_video_set()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  _url text;
begin
  -- Only fire when video transitions null → a value (i.e. first upload).
  if old.video is null and new.video is not null then
    _url := coalesce(
              nullif(current_setting('app.settings.supabase_url', true), ''),
              'http://kong:8000'   -- supabase local-dev internal URL
            ) || '/functions/v1/process-interview';

    -- Fire-and-forget HTTP POST via pg_net (non-blocking).
    -- process-interview has verify_jwt = false so no auth header is required.
    perform net.http_post(
      url     := _url,
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body    := jsonb_build_object('interviewId', new.id)
    );
  end if;

  return new;
end;
$$;

-- ── Trigger ───────────────────────────────────────────────────────────────────

create or replace trigger interviews_on_video_set_tgr
  after update of video
  on public.interviews
  for each row
  execute function public.interviews_on_video_set();
