-- Roots schema: people + interviews
-- Memories and timeline are stored as jsonb on the person; transcript is a jsonb
-- array of { question, response } records on the interview.

create table if not exists public.people (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  dob         date,
  memories    jsonb not null default '[]'::jsonb,
  timeline    jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now()
);

create table if not exists public.interviews (
  id          uuid primary key default gen_random_uuid(),
  person_id   uuid not null references public.people(id) on delete cascade,
  time        timestamptz not null default now(),
  transcript  jsonb not null default '[]'::jsonb,
  video       text,
  created_at  timestamptz not null default now()
);

create index if not exists interviews_person_id_idx on public.interviews(person_id);
create index if not exists interviews_time_idx       on public.interviews(time desc);

alter table public.people     enable row level security;
alter table public.interviews enable row level security;

-- Hackathon-stage: permissive policies so the anon key can read/write.
-- Tighten before any real users land.
create policy "people: anon all"     on public.people     for all using (true) with check (true);
create policy "interviews: anon all" on public.interviews for all using (true) with check (true);

-- Storage bucket for interview videos.
insert into storage.buckets (id, name, public)
values ('interview-videos', 'interview-videos', true)
on conflict (id) do nothing;

create policy "interview-videos: anon read"   on storage.objects for select using (bucket_id = 'interview-videos');
create policy "interview-videos: anon write"  on storage.objects for insert with check (bucket_id = 'interview-videos');
create policy "interview-videos: anon update" on storage.objects for update using (bucket_id = 'interview-videos');
create policy "interview-videos: anon delete" on storage.objects for delete using (bucket_id = 'interview-videos');
