-- v1 changes on top of 0001_init.sql.

-- 1. Facts hold numbers, ISO dates ('2027-04-30') and bracket tables, so value is jsonb.
alter table facts alter column value type jsonb using to_jsonb(value);
alter table facts alter column last_checked drop not null;
alter table facts add column if not exists source_quality text check (source_quality in ('official','secondary','knowledge'));
alter table facts add column if not exists verified boolean not null default false;

-- 2. Confirm-before-save. A candidate value waits in pending_* until the user
--    confirms it, so an inferred fact never overwrites a confirmed one.
--    value = 'null'::jsonb with confirmed_at null means "nothing confirmed yet".
alter table profile_facts add column if not exists pending_value jsonb;
alter table profile_facts add column if not exists pending_source fact_source;
alter table profile_facts add column if not exists pending_confidence real;
alter table profile_facts add column if not exists pending_at timestamptz;

-- 3. Programs carry a kind (benefit | credit | obligation | info).
alter table programs add column if not exists kind text not null default 'benefit';

-- 4. Transactions: keep a coarse hash of the upload for de-duplication (no raw file is stored).
alter table transactions add column if not exists upload_id uuid;

-- 5. Hybrid search with an optional program filter. Same scoring as 0001.
--    The return type changes, so drop the 0001 version first.
drop function if exists search_chunks(vector, text, int);
create or replace function search_chunks(query_embedding vector(1024), query_text text, match_count int default 8, filter_program text default null)
returns table (chunk_id uuid, text text, heading text, url text, title text, program_id text, score real)
language sql stable as $$
  with scoped as (
    select c.* from chunks c
    join documents d on d.id = c.document_id
    join sources s on s.id = d.source_id
    where c.embedding is not null and (filter_program is null or s.program_id = filter_program)
  ),
  vec as (
    select id, 1 - (embedding <=> query_embedding) as vscore
    from scoped order by embedding <=> query_embedding limit 30
  ),
  kw as (
    select id, ts_rank(tsv, plainto_tsquery('simple', query_text)) as kscore
    from scoped where tsv @@ plainto_tsquery('simple', query_text) limit 30
  )
  select c.id, c.text, c.heading, s.url, d.title, s.program_id,
         (coalesce(v.vscore,0) * 0.7 + coalesce(k.kscore,0) * 0.3)::real as score
  from chunks c
  join documents d on d.id = c.document_id
  join sources s on s.id = d.source_id
  left join vec v on v.id = c.id
  left join kw k on k.id = c.id
  where v.id is not null or k.id is not null
  order by score desc limit match_count;
$$;

-- 6. Users may record tool calls for their own messages (debug view).
create policy "insert own tool calls" on tool_calls for insert
  with check (exists (select 1 from messages m join conversations c on c.id = m.conversation_id where m.id = message_id and c.user_id = auth.uid()));

-- 7. Users may read/update their own profile row on first visit.
create or replace function ensure_profile() returns void language sql security invoker as $$
  insert into profiles (user_id) values (auth.uid()) on conflict (user_id) do nothing;
$$;
