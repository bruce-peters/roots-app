-- Add profile fields to people that the app displays on Home / Person screens.
-- These don't fit cleanly into the existing name / dob columns.

alter table public.people
  add column if not exists nick     text,
  add column if not exists relation text,
  add column if not exists place    text;

-- Add session-level metadata to interviews.

alter table public.interviews
  add column if not exists topic    text,
  add column if not exists duration text;
