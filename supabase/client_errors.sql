-- Crash reports from the app itself, so a bug that happens to someone else
-- doesn't depend on them bothering to tell you about it.
--
-- Deliberately in your own database rather than a third-party service: no extra
-- account to run, nothing added to the bundle, and each row already carries the
-- build id so you can tell "this is fixed" from "they're on an old build".
--
-- Run this once in the Supabase SQL editor.

create table if not exists public.client_errors (
  id          bigint generated always as identity primary key,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  message     text        not null,
  stack       text,
  -- where it came from: render | window | promise | manual
  source      text        not null default 'manual',
  url         text,
  build       text,        -- __BUILD_ID__ of the bundle that crashed
  user_agent  text,
  context     jsonb
);

alter table public.client_errors enable row level security;

-- Same shape as the rest of the app: you can only write and read your own rows.
drop policy if exists "insert own client errors" on public.client_errors;
create policy "insert own client errors" on public.client_errors
  for insert with check (auth.uid() = user_id);

drop policy if exists "read own client errors" on public.client_errors;
create policy "read own client errors" on public.client_errors
  for select using (auth.uid() = user_id);

drop policy if exists "delete own client errors" on public.client_errors;
create policy "delete own client errors" on public.client_errors
  for delete using (auth.uid() = user_id);

create index if not exists client_errors_user_time
  on public.client_errors (user_id, created_at desc);
