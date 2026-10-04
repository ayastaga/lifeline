-- Lifeline initial schema. Run with `npx supabase db reset`.
create extension if not exists vector;
create extension if not exists pgcrypto;

-- ---------- Users ----------
create table profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  language text not null default 'en',          -- en fr zh hi ur pa ar es
  script text,                                   -- e.g. 'Guru' (Gurmukhi) | 'Arab' (Shahmukhi) | 'Latn'
  province text,                                 -- ISO-like code: ON, BC, ...
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create type fact_source as enum ('user', 'inferred', 'statement');

create table profile_facts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,                             -- must exist in ProfileSchema (e.g. 'status', 'children')
  value jsonb not null,
  source fact_source not null default 'user',
  confidence real,                               -- for inferred facts
  confirmed_at timestamptz,                      -- null = not yet confirmed by the user
  created_at timestamptz not null default now(),
  unique (user_id, key)
);

-- ---------- Knowledge (shared, read-only for users) ----------
create table programs (
  id text primary key,                           -- 'gst_hst_credit'
  name text not null,
  level text not null check (level in ('federal','provincial')),
  jurisdiction text not null default 'CA',       -- 'CA' or 'ON'
  personas text[] not null default '{}',         -- student, newcomer, family, gig
  apply_url text not null,
  rules jsonb not null,                          -- contents of rules/programs/<id>.json
  verify boolean not null default true,          -- true until a human verified rules + facts
  updated_at timestamptz not null default now()
);

create table facts (
  key text not null,                             -- 'cesg_match_rate'
  value numeric not null,
  unit text not null,                            -- 'cad' | 'percent' | 'years' | 'count'
  effective_year int not null,
  source_url text not null,
  last_checked date not null,
  note text,
  primary key (key, effective_year)
);

create table sources (
  id uuid primary key default gen_random_uuid(),
  url text unique not null,
  domain text not null,                          -- canada.ca | ontario.ca
  program_id text references programs(id),
  language text not null default 'en',
  last_crawled timestamptz,
  content_hash text
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references sources(id) on delete cascade,
  title text,
  text text not null,
  fetched_at timestamptz not null default now()
);

create table chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  ord int not null,
  heading text,
  text text not null,
  embedding vector(1024),                        -- BGE-M3 dimension
  tsv tsvector generated always as (to_tsvector('simple', coalesce(heading,'') || ' ' || text)) stored
);
create index chunks_embedding_idx on chunks using hnsw (embedding vector_cosine_ops);
create index chunks_tsv_idx on chunks using gin (tsv);

-- ---------- Optional statements ----------
create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  posted_on date not null,
  description text not null,
  amount numeric not null,                       -- negative = spend
  category text,                                 -- rent, tuition, childcare, gig_income, ...
  created_at timestamptz not null default now()
);

-- ---------- Conversation ----------
create table conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  language text not null,
  created_at timestamptz not null default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant','tool')),
  content text not null,
  citations jsonb,                               -- [{url, title}] attached by code
  created_at timestamptz not null default now()
);

create table tool_calls (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references messages(id) on delete cascade,
  tool text not null,
  input jsonb not null,
  output jsonb,
  created_at timestamptz not null default now()
);

create table feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid references messages(id) on delete set null,
  program_id text references programs(id),
  kind text not null check (kind in ('thumbs_up','thumbs_down','applied','approved','denied')),
  note text,
  created_at timestamptz not null default now()
);

-- ---------- Row-level security ----------
alter table profiles enable row level security;
alter table profile_facts enable row level security;
alter table transactions enable row level security;
alter table conversations enable row level security;
alter table messages enable row level security;
alter table tool_calls enable row level security;
alter table feedback enable row level security;

create policy "own profile" on profiles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own facts" on profile_facts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own transactions" on transactions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own conversations" on conversations for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own messages" on messages for all
  using (exists (select 1 from conversations c where c.id = conversation_id and c.user_id = auth.uid()))
  with check (exists (select 1 from conversations c where c.id = conversation_id and c.user_id = auth.uid()));
create policy "own tool calls" on tool_calls for select
  using (exists (select 1 from messages m join conversations c on c.id = m.conversation_id where m.id = message_id and c.user_id = auth.uid()));
create policy "own feedback" on feedback for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Knowledge tables: readable by everyone signed in, writable only by service role.
alter table programs enable row level security;
alter table facts enable row level security;
alter table sources enable row level security;
alter table documents enable row level security;
alter table chunks enable row level security;
create policy "read programs" on programs for select using (true);
create policy "read facts" on facts for select using (true);
create policy "read sources" on sources for select using (true);
create policy "read documents" on documents for select using (true);
create policy "read chunks" on chunks for select using (true);

-- ---------- Hybrid search ----------
create or replace function search_chunks(query_embedding vector(1024), query_text text, match_count int default 8)
returns table (chunk_id uuid, text text, heading text, url text, title text, score real)
language sql stable as $$
  with vec as (
    select c.id, 1 - (c.embedding <=> query_embedding) as vscore
    from chunks c order by c.embedding <=> query_embedding limit 30
  ),
  kw as (
    select c.id, ts_rank(c.tsv, plainto_tsquery('simple', query_text)) as kscore
    from chunks c where c.tsv @@ plainto_tsquery('simple', query_text) limit 30
  )
  select c.id, c.text, c.heading, s.url, d.title,
         (coalesce(v.vscore,0) * 0.7 + coalesce(k.kscore,0) * 0.3)::real as score
  from chunks c
  join documents d on d.id = c.document_id
  join sources s on s.id = d.source_id
  left join vec v on v.id = c.id
  left join kw k on k.id = c.id
  where v.id is not null or k.id is not null
  order by score desc limit match_count;
$$;
