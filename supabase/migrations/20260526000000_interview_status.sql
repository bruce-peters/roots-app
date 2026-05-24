-- Add a status column to interviews to track recording lifecycle.
-- 'started'     — default; interview is in progress.
-- 'completed'   — user pressed End; recording is done.
-- 'not started' — reserved for future use (pre-recording setup).
--
-- The physical device polls get-interview-status to discover when the
-- user has tapped End so it can stop recording and upload.

alter table public.interviews
  add column if not exists status text not null default 'started'
  check (status in ('not started', 'started', 'completed'));
