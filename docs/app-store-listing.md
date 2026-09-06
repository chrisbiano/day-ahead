# Day Ahead — App Store listing

Draft copy and declarations for App Store Connect. Character limits are Apple's
and are enforced by the form.

Everything here is derived from what the code actually does, not from what the
app is meant to do — the scope list came from the OAuth requests in
`supabase/functions`, and the data declarations from the live table columns. If
either changes, this file is wrong until it's updated.

---

## Listing copy

**Name** (30 max)

    Day Ahead

**Subtitle** (30 max)

    Wake up to clarity

The tagline, not a search play — it already appears on the landing page, in the
header, and in the footer, and that consistency is worth more than the keyword
room. Apple indexes the subtitle, so the 100-character keyword field carries the
search load alone; nothing in the name or subtitle duplicates a keyword, so none
of it is wasted.

**Promotional text** (170 max — editable without a new build)

    One screen for your calendar, tasks, and inbox — with a morning brief that
    says what matters today, and unfinished work carried forward rather than
    held against you.

**Keywords** (100 max, comma-separated, no spaces after commas)

    adhd,daily planner,agenda,todo,calendar,gmail,inbox,focus,reminders,brief,freelance,creative

92 characters. `adhd` is deliberate and Chris approved it (2026-09-05): it is the
highest-intent search term for the person this is built for. It holds up only
because the copy describes the DAY and never the person — no treatment claim
anywhere, in the listing or in any ad. Cross that line and the keyword becomes a
liability.

**Description** (4000 max)

    Day Ahead is a single screen that answers one question: what does today
    actually look like?

    It's built for days that move — the client email that reorders your
    afternoon, the call that shifts, the work that didn't get finished. Your
    calendar, your tasks, and the email you still owe someone live in one
    place, not three apps you check in rotation.

    THE MORNING BRIEF
    Before you've opened anything, Day Ahead tells you the shape of your day:
    what's scheduled, what's still open, and who's waiting on a reply. It
    arrives as a notification, so you start the day knowing rather than
    guessing.

    IT READS YOUR EMAIL SO YOU DON'T HAVE TO
    Connect every mailbox. Day Ahead sorts what came in into what genuinely
    needs a reply, what's worth reading, and what's noise — then lets you answer
    without leaving the app, with your own signature intact. You don't have to
    open your inbox to know what's in it.

    YESTERDAY DOESN'T FOLLOW YOU AROUND
    Unfinished work doesn't sink to the bottom of a list. Day Ahead collects
    what you didn't get to and offers it to today — move it, drop it, or file it
    under something already scheduled. Nothing accumulates and nothing turns
    red. A finished day shows what you actually accomplished.

    YOUR SCHEDULE, NOT A SECOND CALENDAR
    Google Calendar events sit alongside your tasks. All-day events stay out of
    the way. Anything you'd rather not see, you can hide without deleting.
    Read-only — Day Ahead never writes to your calendar.

    ON YOUR HOME SCREEN
    Two widgets: "Next up" for the one thing that's coming, and "Today" for your
    day at a glance.

    QUIET WHEN YOU NEED IT
    Pause notifications for an hour, the rest of the day, or a week. Turn the AI
    off entirely and keep everything else — calendar, tasks, and reminders work
    exactly the same.

    PRIVACY
    No tracking, no advertising, nothing sold. Export everything or delete your
    account from inside the app — no email to support, no waiting.

    Day Ahead requires a Google account.

**What's New** (for the first release)

    First release.

---

## URLs and metadata

| Field | Value |
|---|---|
| Privacy policy URL | https://dayahead.app/privacy.html |
| Terms of use (EULA) | https://dayahead.app/terms.html |
| Support URL | **DECISION NEEDED** — see below |
| Marketing URL | https://dayahead.app |
| Category (primary) | Productivity |
| Category (secondary) | Business |
| Age rating | 4+ |

Apple requires a **support URL that resolves and offers a way to make contact**.
`dayahead.app` on its own is a marketing page; if it has no contact route,
reviewers can and do reject on it. Cheapest fix is a `/support` page with an
email address on it.

---

## Privacy nutrition labels

Declared per Apple's taxonomy. "Linked" means Apple's "Data Linked to You" —
tied to identity — which is true for everything here, because every row is
scoped to a Supabase user id.

**Tracking: No.** No advertising, no analytics SDK, no data shared with data
brokers, nothing combined with data from other companies' apps.

| Apple data type | Collected | Purpose | Linked | Why |
|---|---|---|---|---|
| Contact Info → Email Address | Yes | App Functionality | Yes | Account identity and each connected mailbox address |
| Contacts | Yes | App Functionality | Yes | `contacts.other.readonly` powers recipient autocomplete when replying |
| User Content → Emails or Text Messages | Yes | App Functionality | Yes | `email_verdicts` retains sender, subject, and snippet for triage |
| User Content → Other User Content | Yes | App Functionality | Yes | Tasks, subtasks, and notes on calendar events |
| Identifiers → User ID | Yes | App Functionality | Yes | Supabase user id, scopes every row |
| Diagnostics → Crash/Other Diagnostic Data | Yes | App Functionality | Yes | `client_errors` records errors with `user_id` attached |

**Deliberately not declared**, because the app genuinely doesn't do it:

- **Location** — never requested.
- **Usage Data** — no analytics, no product telemetry.
- **Purchases** — no billing yet. This changes the day in-app purchase ships.
- **Search History / Browsing History** — not collected.
- **Calendar events themselves** — read live from Google on each load and never
  written to the database. Only *your notes about* an event are stored, and
  those fall under Other User Content. Worth stating plainly if a reviewer asks
  why calendar isn't in the list.

---

## Third parties that receive user data

Needed for the privacy policy and for the Google verification track; Apple asks
about it indirectly through the labels.

| Who | What reaches them | Why |
|---|---|---|
| Google | OAuth tokens; calendar, Gmail, and contact reads | The data source |
| Supabase | Everything stored | Database, auth, and function hosting |
| Anthropic | Email sender, subject, and snippet; the day's schedule summary | Generates triage verdicts and the morning brief |
| Apple (APNs) | Notification title and body | Push delivery |

The Anthropic row is the one people don't expect. It belongs in the privacy
policy in plain words, since "an AI reads my email" is exactly the thing a
cautious user wants stated rather than discovered.

---

## App Review notes — read this before submitting

**Day Ahead cannot be reviewed without working credentials.** Sign-in is Google
OAuth only, there is no username-and-password path, and an empty account shows
an empty screen. A reviewer who can't get in rejects on Guideline 2.1, and this
is the single most common reason an app like this bounces.

So the submission needs:

1. **A demo Google account** with real-looking calendar events, a few tasks, and
   some mail in the inbox. An account with nothing in it looks broken.
2. That account's credentials in the **App Review Information** fields.
3. A note that 2-Step Verification must be **off** on the demo account, or the
   reviewer will be stopped at a device-approval prompt they cannot satisfy.

Suggested note to Apple:

    Day Ahead signs in with Google only. Demo credentials are provided above.
    The account is pre-populated with calendar events, tasks, and email so the
    app's features are visible.

    Notifications: reminders and the morning brief are delivered by push. To
    see one immediately, open Settings inside the app and tap "Send a test
    notification".

    The app reads Gmail and Calendar to build the day view and triage the
    inbox. It does not send email without an explicit action from the user.

---

## Assets still needed

| Asset | Requirement | Status |
|---|---|---|
| App icon | 1024×1024, no alpha, no rounded corners | **Done** — Chris supplied artwork, shipped 2026-08-17 |
| iPhone screenshots | 6.9" display, 3–10 images | Not started |
| iPad screenshots | Only if the app ships as iPad-compatible | Decide first |

Screenshots are the listing. Worth capturing the day view, the morning brief
notification, the carryover card, and both widgets on a home screen.

---

## Open decisions

1. **Support URL** — a `/support` page, or an existing contact route.
2. **iPad** — ship iPhone-only at first, or support iPad? Shipping iPad means
   testing it and screenshotting it; iPhone-only is a legitimate choice and
   less to defend at review.
3. **Demo account** — needs creating and populating before submission.
4. ~~**Price**~~ — DECIDED 2026-09-05: **$9.99/month, $79.99/year, 7-day trial,
   no free tier.** A free tier was considered and rejected: free users are the
   heaviest support load per pound earned, and you can always add one later
   whereas removing one is a public event. The AI switch stays a privacy
   control, not a paywall.

   **Founding rate: $5.99/month for life** for anyone who signed up during beta.
   Identifying them needs no work now — `auth.users.created_at` already records
   it; just fix the cutoff date when billing ships. Honouring it on iOS means a
   second subscription product (or a recurring offer code) shown only to those
   accounts, since Apple can't grandfather a price on the same product.

   Break-even for reference: ~30 subscribers covers CASA, Supabase and hosting.
