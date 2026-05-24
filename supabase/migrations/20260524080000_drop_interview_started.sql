-- Drop the `started` column from interviews. We now rely solely on `active`
-- to represent the current/in-progress session.
alter table public.interviews
  drop column if exists started;
