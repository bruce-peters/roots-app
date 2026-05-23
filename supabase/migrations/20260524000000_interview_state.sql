-- Interview state columns for live recording.
-- `active`  — exactly one interview is the "current" one the device talks to.
-- `started` — has the box been told to begin recording yet.
-- `shift_question` / `deeper_question` — last AI-suggested next questions.

alter table public.interviews
  add column if not exists active          boolean not null default false,
  add column if not exists started         boolean not null default false,
  add column if not exists shift_question  text,
  add column if not exists deeper_question text;

-- At most one active interview at a time.
create unique index if not exists interviews_one_active_idx
  on public.interviews ((true)) where active;
