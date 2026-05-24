-- Remove topic column from interviews; unused in the app.
alter table public.interviews
  drop column if exists topic;
