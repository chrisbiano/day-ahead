# Shipping Day Ahead

How to make a change safely once real people are using this. Written to be
followed without help — every step is a command you can run or a click you can
make.

---

## The short version

```
branch  →  preview URL  →  merge to main  →  live in ~2 min
```

Never push straight to `main` once you have users. A branch gets its own private
preview URL on Vercel automatically, so you test the real thing before anyone
else sees it.

---

## 1. Make the change on a branch

```bash
git checkout -b fix-whatever-it-is
```

Commit as normal, then:

```bash
git push -u origin fix-whatever-it-is
```

Vercel builds it and posts a **preview URL** (visible on the deployment in the
Vercel dashboard). It's the full app, on the real database — so treat it as real:
if you delete a task there, it's actually deleted.

## 2. Test on the preview URL

Whatever you changed, plus a quick pass over anything nearby.

## 3. Merge

```bash
git checkout main
git merge fix-whatever-it-is
git push
```

Live in about two minutes.

---

## Order matters: functions before frontend

If a change touches BOTH an edge function and the app, deploy the **function
first**:

```bash
~/.local/bin/supabase functions deploy <name> --project-ref muboxidryqmpnpmkdyfh
```

then merge the frontend. Otherwise the new app calls an endpoint that isn't there
yet and users get a 404 for a couple of minutes.

**Health check after deploying a function** — the expected codes differ, and this
is how you catch a misconfigured one:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  https://muboxidryqmpnpmkdyfh.supabase.co/functions/v1/<name> \
  -H "Content-Type: application/json" -d '{}'
```

- every function → **401** (it wants a login token — correct)
- `scheduler-tick` → **403** (it has its own cron-secret gate)

A `scheduler-tick` that answers 401 means Verify-JWT got switched on and the cron
is broken.

---

## Confirming a deploy actually landed

**Do not trust the JS bundle filename.** It changes on every build and the CDN
can serve you a stale one — that combination has lied to us more than once. Use
the build id:

```bash
# BEFORE pushing, note what's currently live:
curl -s https://dayahead.app/version.json
# then push, and watch that number CHANGE.
```

Compare against the id you captured *before* the push — not against a fresh local
`npm run build`. A local build stamps itself with the current time, so it will
always look newer than the server and you'll wait forever for a deploy that
already landed.

If the served id doesn't move within a few minutes, **the deploy never happened**
— GitHub's webhook to Vercel occasionally skips a push silently. Nudge it:

```bash
git commit --allow-empty -m "retrigger deploy"
git push
```

---

## When something breaks in production

**Roll back first, debug after.** Don't fix forward under pressure.

Vercel dashboard → **Deployments** → find the last good one → **⋯ → Promote to
Production**. Live again in about ten seconds, no code involved.

Then fix properly on a branch.

---

## Database changes are the dangerous ones

Frontend and functions roll back instantly. **The database does not.**

- **Add**, don't rename or drop. New column beside the old one.
- Let old and new coexist for a release; clean up only when you're sure nothing
  still reads the old shape.
- Run the SQL in the Supabase SQL editor, and keep the file in `supabase/*.sql`
  so there's a record of what was run.

The one genuinely scary incident so far was a data-shape change (event ids moving
from account-id to account-email, which orphaned every event's subtasks) — and
that was with a single user.

---

## Knowing about bugs you didn't hit yourself

Crashes are filed automatically into the `client_errors` table — render errors,
uncaught exceptions, and rejected promises, each with the build id of the bundle
it happened on.

To read them: Supabase dashboard → **Table editor** → `client_errors`, newest
first. Or SQL:

```sql
select created_at, source, message, build, url
from client_errors
order by created_at desc
limit 50;
```

The `build` column is the useful one: it tells you whether someone is hitting a
bug you already fixed but they haven't reloaded into yet.

---

## Things that update on their own — and things that don't

**Automatic:** the web app (the updater forces a reload when a new build ships),
edge functions once deployed, anything in the database.

**NOT automatic — icons.** Browsers and operating systems snapshot an app icon
and keep it. After changing icons, expect:

- **Browser tab** — needs a new *filename* (query strings don't bust favicon
  caches, and Safari ignores SVG favicons entirely)
- **Safari "Add to Dock" apps** — the icon is frozen into a bundle in
  `~/Applications` at install time. Nothing server-side can change it; the old
  app has to be deleted and re-added.
- **iPhone home screen** — same; remove and re-add, and re-enable notifications
  afterwards (a fresh install resets the push subscription)

---

## Before you call it launched

- [ ] `client_errors.sql` has been run
- [ ] You've done a rollback once on purpose, so you know where the button is
- [ ] There's a way for users to report a problem
- [ ] You know which Vercel deployment is currently live
