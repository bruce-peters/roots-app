-- Track when suggest-next-questions last ran for an interview, so
-- process-transcript can debounce-trigger it without re-calling the LLM
-- on every transcript chunk. last_suggested_len is the transcript length
-- (in chars) at the time of the last suggestion; last_suggested_at is the
-- wall-clock timestamp. Both null = never suggested yet (first chunk fires).

alter table public.interviews
  add column if not exists last_suggested_len int,
  add column if not exists last_suggested_at timestamptz;
