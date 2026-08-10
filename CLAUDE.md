# Day Ahead

A personal daily command centre for Chris (Fast Rose Creative): calendar + tasks
+ Gmail triage, with Claude summarising the day and sorting the inbox. Live at
**https://dayahead.app**. Tagline: "Wake up to clarity."

The folder and repo are still named `sentinel` — that was the original product
name. **The product is Day Ahead**; don't reintroduce "Sentinel" in user-facing
copy. (Sentyra was an interim name, parked as a possible parent-company name.)

## This project is standalone
It is separate from **First Cut / AI Video Editor** (`../ai_video_editor`) and
from **Lost Saints Social HQ** (`../lost-saints-social-hq`). Don't read, edit, or
reference those from here — each project gets its own session so tooling only
ever sees one of them.

## Run it
- `npm run dev` (Vite). The `sentinel` config in `.claude/launch.json` drives the
  preview tool.
- `npm run build` before every deploy — it's the only compile check there is.
- Node lives at `~/.local/node/bin` and is **not on PATH**; prefix commands with
  `export PATH="$HOME/.local/node/bin:$PATH"`.
- Tests are plain node scripts, no runner: `node tests/carryOver.test.mjs`.

## Stack
React 18 + Vite + Tailwind. Colours come from CSS-variable design tokens
(`--c-bg`, `--c-surface`, `--c-line`, `--c-fg`, `--c-muted`, `--c-faint`,
`--c-accent`, `--c-warn`…) so light and dark both work — **never hard-code a
colour**, both themes ship and both are checked.

Supabase for auth (Google OAuth), Postgres + RLS, and Deno edge functions
(`supabase/functions/*`), with pg_cron driving `scheduler-tick`. Claude calls run
inside edge functions on `claude-haiku-4-5` with a JSON schema in
`output_config`.

## Deploying — read RELEASE.md, it is the real procedure
Vercel auto-deploys `main`. The parts that have actually bitten:

- **Verify with `/version.json`, not the bundle hash.** Capture the live build id
  BEFORE pushing, then poll until it changes. Comparing against a freshly built
  local id always looks newer and produces false all-clears.
- A Vercel webhook can silently skip a push. `git commit --allow-empty` kicks it.
- Deploy edge functions BEFORE the frontend that calls them.
- Health gates: every function should answer **401** unauthenticated;
  `scheduler-tick` answers **403** without its cron secret.
- Schema changes are additive only (`add column if not exists`), so a rollback
  never strands the database ahead of the code.

Supabase CLI is at `~/.local/bin/supabase`:
- `supabase functions deploy <name> --project-ref muboxidryqmpnpmkdyfh`
- SQL runs over the Management API — no DB password — after
  `supabase link --project-ref muboxidryqmpnpmkdyfh --yes`, via
  `supabase db query --linked "<sql>"`.
- Chris must run interactive `supabase login` himself.

Never paste the Client Secret, DB password, or service_role key anywhere.

## Conventions worth keeping
- **Soft delete, in place.** A subtask isn't a row, so deleting stamps
  `deletedAt` inside its parent's JSON array — hidden everywhere, restorable
  from "Recently deleted". Carryover reuses the same stamp plus a `leftover`
  marker. Subtask arrays are written verbatim to the JSON columns, so extra
  fields survive the round trip.
- **Batch writes by parent.** Several subtasks often share one parent, and both
  hooks rebuild the array from state that hasn't caught up — a write per subtask
  has each clobber the last. Group by parent, write once.
- **A finished day shows only wins.** Anything unfinished is cleared off a past
  day rather than preserved; completing a carried-over step records it on
  TODAY, because that's when the work happened. Applies to anything
  retrospective — stats, streaks, the daily brief.
- **Never fail silently.** Several bugs here were writes that failed with only a
  `console.error`, so the UI looked like it had worked. Surface errors in the
  banner, and verify by reading back when it matters.
- **Labels over ambiguous icons.** An icon doing double duty reads as a status,
  not an action — that's what made the hide toggle take two clicks and look
  broken.
- `parse-task` builds its response **field by field**: adding a field to the
  SCHEMA without adding it there means it's silently dropped.
- iOS Safari gives inputs an intrinsic width: `size={1} min-w-0 w-0` on the
  input, `shrink-0` on its siblings, or the row overflows the screen.

## Working with Chris
- He often reviews from his phone — share UI changes as screenshots rather than
  asking him to look at his screen, and check narrow widths before shipping.
- His bug reports are literal and accurate. Reproduce and find the real
  mechanism before patching; if a fix doesn't hold, the model of the problem is
  wrong, so re-derive rather than patch the same theory again.
- Domain purchases, GitHub repo creation, and anything entering credentials are
  his actions, not yours. When walking him through a dashboard, give ONE step at
  a time.

## Open threads
Landing-page feedback; beta access (5 users on Production+unverified needs a
server-side email allowlist); better icon art (1024×1024 render from Chris);
ToS, Stripe billing, signup flow, per-user cost metering; Google OAuth
verification + CASA quotes.
