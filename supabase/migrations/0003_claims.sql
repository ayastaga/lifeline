-- Milestone 1: claim-level sourcing and spoken facts.

-- Facts carry the exact quoted span they were verified against, the source tier,
-- the period they apply to, and when they must be re-checked.
alter table facts add column if not exists quote text;
alter table facts add column if not exists retrieved_at date;
alter table facts add column if not exists tier smallint not null default 1 check (tier between 1 and 3);
alter table facts add column if not exists effective_from date;
alter table facts add column if not exists effective_until date;
alter table facts add column if not exists review_trigger text check (review_trigger in ('annual','tax_year_change','on_page_change'));

-- Facts the user said out loud are tracked separately: they get read back before saving.
alter type fact_source add value if not exists 'spoken';

-- Program kinds now include registered accounts.
alter table programs drop constraint if exists programs_kind_check;
alter table programs add column if not exists roadmap_tier smallint not null default 3;

-- Per-user reply settings (input/reply language and mode are independent).
alter table profiles add column if not exists reply_language text;
alter table profiles add column if not exists reply_mode text not null default 'text' check (reply_mode in ('text','audio'));
