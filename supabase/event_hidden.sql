-- Hide a calendar event from the schedule.
--
-- Google Calendar is read-only here, so hiding is a Day Ahead-side flag, not a
-- change to the calendar. The event stays exactly where it is in Google — it
-- just stops cluttering your day.
--
-- Run this once in the Supabase SQL editor. Safe to re-run.

alter table public.event_notes
  add column if not exists hidden boolean not null default false;
