-- Revert: drop the DB trigger that called process-interview on video upload.
-- process-interview is now invoked directly from the upload-video edge function.

drop trigger if exists interviews_on_video_set_tgr on public.interviews;
drop function if exists public.interviews_on_video_set();
