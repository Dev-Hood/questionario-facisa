create table if not exists public.questionnaire_settings (
  id text primary key,
  post_unlocked boolean not null default false,
  access_locked boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.questionnaire_settings
add column if not exists access_locked boolean not null default false;

create table if not exists public.questionnaire_submissions (
  id uuid primary key,
  user_name text not null,
  normalized_user text not null unique,
  pre jsonb,
  post jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.questionnaire_settings (id, post_unlocked)
values ('global', false)
on conflict (id) do nothing;

insert into public.questionnaire_settings (id, post_unlocked)
values ('access', false)
on conflict (id) do nothing;
