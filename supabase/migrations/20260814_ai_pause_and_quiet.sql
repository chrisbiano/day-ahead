-- Day Ahead — two switches the user controls: turn the AI off, and go quiet.
--
-- Both are preferences the SERVER checks before acting on someone's behalf.
-- Putting them anywhere else would be theatre: the scheduler runs every minute
-- whether or not the app is open, so a client-side toggle would keep sending.
--
-- Written idempotently so it is safe to re-run.

-- Turning this off stops every call to the AI provider for this user: inbox
-- triage, the morning brief's wording, natural-language task parsing, and reply
-- drafting. It does not disable those features — they degrade. Mail still
-- lists, the brief still sends as plain counts, tasks still save as typed.
--
-- Default true because that is the product people signed up for; this is an
-- opt-out, not a setup step.
alter table public.user_prefs
  add column if not exists ai_enabled boolean not null default true;

-- Quiet mode. NULL means notifications are on.
--
-- A timestamp rather than a boolean on purpose: a switch you have to remember
-- to turn back off is how someone misses two weeks of reminders and blames the
-- app. Presets set this to a real moment, and it lapses on its own.
--
-- 'infinity' is a genuine timestamptz value in Postgres, so "off until I say
-- otherwise" is expressible without a second column or a sentinel year.
alter table public.user_prefs
  add column if not exists quiet_until timestamptz;

comment on column public.user_prefs.ai_enabled is
  'False stops all AI provider calls for this user. Features degrade, they do not disappear.';
comment on column public.user_prefs.quiet_until is
  'Suppress reminders and briefs until this moment. NULL = on. infinity = until turned back on.';
