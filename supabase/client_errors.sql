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


-- Problems people report in their own words. Crash reporting only catches things
-- that BREAK; this catches "that did the wrong thing" and "I couldn't work out
-- how to…", which is most of what actually goes wrong with a product.
--
-- Same file on purpose: running this once sets up both. Safe to re-run.

create table if not exists public.problem_reports (
  id          bigint generated always as identity primary key,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  message     text        not null,
  -- captured automatically so a report is actionable without a follow-up email
  build       text,
  url         text,
  user_agent  text,
  -- open | done, so you can work through them without a separate tool
  status      text        not null default 'open'
);

alter table public.problem_reports enable row level security;

drop policy if exists "insert own reports" on public.problem_reports;
create policy "insert own reports" on public.problem_reports
  for insert with check (auth.uid() = user_id);

drop policy if exists "read own reports" on public.problem_reports;
create policy "read own reports" on public.problem_reports
  for select using (auth.uid() = user_id);

drop policy if exists "update own reports" on public.problem_reports;
create policy "update own reports" on public.problem_reports
  for update using (auth.uid() = user_id);

create index if not exists problem_reports_user_time
  on public.problem_reports (user_id, created_at desc);
