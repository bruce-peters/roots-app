-- Two rules for interview.active:
--
--  1. SINGLE-ACTIVE TRIGGER
--     When any interview is set active = true, all other interviews are
--     automatically flipped to active = false first.  This makes the
--     existing unique partial index (interviews_one_active_idx) self-healing
--     instead of raising a unique-violation error.
--
--  2. DEFAULT TRUE
--     Every newly inserted interview starts as the active one.

-- ── 1. Trigger function ──────────────────────────────────────────────────────

create or replace function public.interviews_enforce_single_active()
returns trigger
language plpgsql
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

-- Fire before INSERT or any UPDATE that touches the active column.
create or replace trigger interviews_single_active_tgr
  before insert or update of active
  on public.interviews
  for each row
  execute function public.interviews_enforce_single_active();

-- ── 2. Default true ──────────────────────────────────────────────────────────

alter table public.interviews
  alter column active set default true;
