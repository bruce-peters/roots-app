-- Change interviews.transcript from jsonb array to plain text.
-- The physical device now streams the full raw transcript as a single
-- text blob instead of structured Q/A pairs.

alter table public.interviews
  alter column transcript type text using '',
  alter column transcript set default '';
