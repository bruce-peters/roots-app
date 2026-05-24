-- Replace the trigger function with a hardcoded project URL.
-- ALTER DATABASE SET for custom GUCs is not permitted on Supabase hosted;
-- embedding the URL directly in the function body is the practical alternative.

create or replace function public.interviews_on_video_set()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only fire when video transitions null → a value (i.e. first upload).
  if old.video is null and new.video is not null then
    -- process-interview has verify_jwt = false so no auth header is required.
    perform net.http_post(
      url     := 'https://hmggakolwdysrcitibry.supabase.co/functions/v1/process-interview',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body    := jsonb_build_object('interviewId', new.id)
    );
  end if;

  return new;
end;
$$;
