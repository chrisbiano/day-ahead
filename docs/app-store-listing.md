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

    Your day, before it starts

**Promotional text** (170 max — editable without a new build)

    Your calendar, tasks, and inbox in one place, with a morning brief that
    tells you what actually matters today.

**Keywords** (100 max, comma-separated, no spaces after commas)

    daily planner,agenda,todo,calendar,gmail,inbox,reminders,productivity,brief,tasks,schedule

**Description** (4000 max)

    Day Ahead is a single screen that answers one question: what does today
    actually look like?

    Your calendar, your tasks, and the email you still owe someone all live in
    one place — not three apps you check in rotation.

    THE MORNING BRIEF
    Every morning, Day Ahead reads your day and tells you what matters: what's
    scheduled, what's still open, and which emails are waiting on a reply. It
    arrives as a notification, so you get the shape of your day before you've
    opened anything.

    YOUR SCHEDULE, WITH CONTEXT
    Calendar events sit alongside your tasks instead of in a separate app.
    All-day events stay out of the way at the top. Anything you don't want to
    see, you can hide without deleting.

    TASKS THAT CARRY FORWARD
    Unfinished work doesn't quietly vanish at midnight. Day Ahead collects what
    you didn't get to and lets you move it to today, drop it, or file it
    against a task that's already scheduled — so a finished day shows what you
    actually accomplished, not a list of everything you meant to do.

    INBOX TRIAGE
    Day Ahead sorts your inbox into what needs a reply, what's just noise, and
    what can wait. Reply without leaving the app, with your own signature
    intact.

    ON YOUR HOME SCREEN
    Two widgets: "Next up" for the one thing that's coming, and "Today" for
    your whole day at a glance.

    PRIVACY
    Day Ahead doesn't track you, doesn't sell your data, and carries no
    advertising. Your Google account stays connected only as long as you want
    it to, and you can export everything or delete your account outright from
    inside the app — no email to support, no waiting.

    Day Ahead requires a Google account for calendar and email.

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
| App icon | 1024×1024, no alpha, no rounded corners | Existing icon is placeholder-grade |
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
4. **Price** — free at launch, or paid from day one? This is also the question
   of whether in-app purchase blocks the first release.
