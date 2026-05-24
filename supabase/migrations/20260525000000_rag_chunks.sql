-- RAG: pgvector store for transcript / memory / timeline chunks.
-- One row per chunk; rebuilt by embed-person after each process-interview run.

create extension if not exists vector;

create table if not exists public.chunks (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.people(id) on delete cascade,
  interview_id uuid references public.interviews(id) on delete cascade,
  kind text not null check (kind in ('transcript', 'memory', 'timeline')),
  ref_id text,
  start_sec real,
  end_sec real,
  year int,
  title text,
  text text not null,
  embedding vector(1536),
  created_at timestamptz not null default now()
);

create index if not exists chunks_person_idx on public.chunks (person_id);
create index if not exists chunks_interview_idx on public.chunks (interview_id);
create index if not exists chunks_embedding_idx on public.chunks
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Similarity search RPC. filter_person scopes to one person; null = global.
create or replace function public.match_chunks(
  query_embedding vector(1536),
  match_count int default 8,
  filter_person uuid default null
)
returns table (
  id uuid,
  person_id uuid,
  interview_id uuid,
  kind text,
  ref_id text,
  start_sec real,
  end_sec real,
  year int,
  title text,
  text text,
  similarity float
)
language sql stable as $$
  select
    c.id, c.person_id, c.interview_id, c.kind, c.ref_id,
    c.start_sec, c.end_sec, c.year, c.title, c.text,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.chunks c
  where (filter_person is null or c.person_id = filter_person)
    and c.embedding is not null
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
