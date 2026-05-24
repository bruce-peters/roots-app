-- Re-create the single-active trigger as SECURITY DEFINER so the internal
-- UPDATE runs with the function owner's privileges (postgres), not the
-- calling role (anon).  Without this, the anon role may lack the UPDATE
-- grant needed to flip the old active row to false, causing the unique
-- partial index (interviews_one_active_idx) to raise a 23505 conflict on
-- the subsequent INSERT.

create or replace function public.interviews_enforce_single_active()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.active = true then
    update public.interviews
    set    active = false
    where  id <> new.id
      and  active = true;
  end if;
  return new;
end;
$$;
