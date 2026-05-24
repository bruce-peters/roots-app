-- Add profile photo URL to people.
alter table public.people
  add column if not exists photo_url text;

-- Storage bucket for profile photos (public read).
insert into storage.buckets (id, name, public)
values ('profile-photos', 'profile-photos', true)
on conflict (id) do nothing;

create policy "profile-photos: anon read"
  on storage.objects for select
  using (bucket_id = 'profile-photos');

create policy "profile-photos: anon insert"
  on storage.objects for insert
  with check (bucket_id = 'profile-photos');

create policy "profile-photos: anon update"
  on storage.objects for update
  using (bucket_id = 'profile-photos');

create policy "profile-photos: anon delete"
  on storage.objects for delete
  using (bucket_id = 'profile-photos');
