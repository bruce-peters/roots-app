alter table public.interviews
  add column if not exists transcript_words jsonb not null default '[]'::jsonb;
