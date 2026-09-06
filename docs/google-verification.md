# Google OAuth verification — Day Ahead

Everything needed for the OAuth consent screen submission. Written against what
the code actually does, checked on 2026-09-06 — if the scopes or the Gmail
actions change, this file is wrong until it's updated, and a justification that
no longer matches the app is worse than none.

## Where things stand

| | |
|---|---|
| Cloud project number | `1095943492774` |
| Publishing status | **In production** |
| User type | **External** |
| Verification | **Not submitted** — console says "Your app requires verification" |
| Domain ownership | **Done** — `google-site-verification` TXT present on dayahead.app |
| App logo | Believed done (Chris, 2026-09-06) |

Being in production rather than Testing matters: refresh tokens do **not** expire
after 7 days. The live costs of being unverified are the "Google hasn't verified
this app" interstitial and a **100-user cap**.


## Paste-ready: what the console actually asks for

The Data Access page has **two** boxes under "How will the scopes be used?" —
one covering all sensitive scopes, one for the restricted scope. These are the
exact texts to paste. The per-scope sections further down are the working notes
they were built from.

Each box caps at **1000 characters**, so these are the trimmed versions that fit.

### Box 1 — sensitive scopes (964 chars)

    Day Ahead shows a user's calendar, tasks and unanswered email on one screen, plus a morning summary notification.

    calendar.readonly — displays the day's events beside their tasks and in the summary. Read-only: the app never creates, edits or deletes events. Events are fetched live and not stored; only the user's own notes about an event are kept.

    contacts.other.readonly — powers recipient autocomplete when replying in-app. It returns addresses the user has emailed but never saved, which is what autocomplete is actually for. Chosen deliberately over contacts.readonly, which would expose full saved contact records the app has no use for. Results go straight to the compose field and are never stored.

    gmail.send — sends a reply the user has written and explicitly sent by tapping Send, with their own signature. Never automatic, never scheduled, never without a direct user action. It grants no read access and is the narrowest scope that permits sending.

### Box 2 — restricted scope (902 chars)

    Day Ahead sorts a user's inbox into what needs a reply, what is worth reading and what is noise, and lets them act on each item without leaving the app. gmail.modify is the only restricted scope requested.

    Reading needs message bodies, not just headers: whether a real person is waiting on a response cannot be judged from a subject line, because marketing mail is written to look personal. Sender, subject and a short preview are stored so the sorted inbox persists between sessions; full message bodies are never stored.

    Acting needs label changes — read/unread, star/unstar, and moving to Trash or back out again — each only when the user taps a control. Nothing is ever permanently deleted: Trash stays recoverable in Gmail and the app offers its own untrash.

    gmail.readonly cannot mark a message read or move it to Trash. gmail.metadata returns no bodies, which the triage judgement depends on.

The retention sentence in Box 2 is deliberate. Sender, subject and snippet ARE
stored (`email_verdicts`); bodies are dropped before insert. Volunteering that
reads far better to an assessor than letting them find it.

## Scopes and why each is needed — working notes

THREE are sensitive — calendar, contacts and `gmail.send` — and exactly ONE is
restricted: `gmail.modify`. That single scope is what triggers the third-party
security assessment (CASA), annually. It is also the smallest restricted surface
possible while keeping inbox triage: `gmail.readonly` cannot mark a message read
or trash it, and `gmail.metadata` returns no bodies.

**Console corrected 2026-09-06**, after the registered scopes were checked
against the code and did not match:
- `calendar.readonly` was **missing** from the consent screen. The OAuth flow
  grants whatever the code requests, so Calendar worked fine — but Google only
  reviews what is *declared*. Undeclared, it would have passed through
  verification unexamined and kept throwing the unverified warning at users
  afterwards. Added.
- `gmail.settings.basic` was still **registered but unused** — a leftover from
  before signatures moved to paste-in. Restricted, and its consent wording is
  "See, edit, create, or change your email settings and filters", i.e. filters
  and forwarding: precisely the power the app gave up on purpose. It widened the
  CASA surface and could not have been justified. Removed.

The lesson worth keeping: the console and the code drift apart silently, and
only the code is the truth. Re-check this table whenever scopes change.

### `calendar.readonly`

> Day Ahead shows the user's schedule for the day alongside their tasks on a
> single screen, and includes it in a daily summary notification. The app only
> reads events — it never creates, edits, or deletes them, and writes nothing
> back to Google Calendar. Events are read live on each load and are not
> retained in our database; only the user's own notes about an event are stored.
> Read-only is the minimum scope that returns event times and titles.

### `contacts.other.readonly`

> When a user replies to an email from inside Day Ahead, the recipient field
> offers autocomplete. This scope returns "other contacts" — addresses the user
> has corresponded with but never saved — which is what makes autocomplete
> useful for people they email regularly without having added to their contacts.
> We deliberately request this narrower scope rather than `contacts.readonly`,
> which would expose full saved contact records the app has no use for. Results
> are passed straight to the compose field and are never written to our database.

### `gmail.modify`

> Day Ahead sorts the user's inbox into what needs a reply, what is worth
> reading, and what is noise, and lets them act on each item without leaving the
> app.
>
> Reading requires message bodies, not just headers: the app must read the body
> to judge whether a specific person is actually waiting on a response. Subject
> lines alone are unreliable, because marketing mail is deliberately written to
> look personal.
>
> Acting requires label changes — marking a message read or unread, starring it,
> and moving it to Trash — each performed only in direct response to the user
> tapping a control. The app never permanently deletes mail; Trash remains
> recoverable in Gmail, and the app offers an untrash action of its own.
>
> `gmail.readonly` is insufficient because it cannot mark a message read or move
> it to Trash. `gmail.metadata` is insufficient because it does not return
> message bodies.

### `gmail.send`

> Day Ahead lets the user reply to an email from within the app, with their own
> signature. This scope is used only to send a message the user has composed and
> explicitly sent by tapping Send. The app never sends email automatically, on a
> schedule, or without a direct user action. `gmail.send` grants no read access
> and is the narrowest scope that permits sending.

## Evidence behind the claims

Checked in the code so a reviewer's cross-examination doesn't surprise us:

- **Calendar is never written.** No write endpoints; events are fetched per load.
- **Contacts are never stored.** `contacts-search` proxies People API's
  `otherContacts:search`; the only tables it touches are `account_tokens` and
  `connected_accounts`, both for token refresh.
- **Gmail writes are exactly:** star, unstar, read, unread, trash, untrash
  (`gmail-action`), plus send. No permanent deletion anywhere.

## The demo video — script

Film it on the **demo Google account** (the one App Review also needs), not
Chris's own: otherwise real client mail ends up in a video sent to Google.

**The single most common reason these bounce is the OAuth client ID not being
legible.** Record the DESKTOP WEB flow, not the phone — the client ID sits in the
browser URL bar during the consent redirect, where on iOS it's buried in a system
sheet. Hold on it for three full seconds:

    1095943492774-4clk6nmt7s210ng1mq3ghcrmg6cmebf2.apps.googleusercontent.com

**Scene 1 — signed out, dayahead.app in a desktop browser**

> This is Day Ahead, a daily planning app. It brings a user's Google Calendar,
> their tasks, and the email waiting on a reply onto one screen. I'll sign in and
> show how each requested scope is used.

**Scene 2 — the consent flow.** Click Continue with Google; let the URL bar rest.

> Signing in with Google. You can see our OAuth client ID in the address bar here.

Then the consent screen, scopes visible:

> And this is the consent screen. Day Ahead requests four scopes: read-only
> access to Google Calendar, other contacts, Gmail send, and Gmail modify. I'll
> demonstrate each one.

**Scene 3 — calendar.** The day view with real events.

> First, calendar.readonly. These are the events from Google Calendar, shown
> alongside the user's tasks for the day. This is read-only — Day Ahead never
> creates, edits, or deletes an event, and never writes anything back to Google
> Calendar. Events are fetched live each time and aren't stored.

**Scene 4 — inbox triage.** Scroll the sorted mail.

> Next, gmail.modify, which is the one restricted scope we request. Day Ahead
> sorts the inbox into what genuinely needs a reply, what's worth reading, and
> what's noise.
>
> This needs the message body, not just the header — you can't tell from a
> subject line whether a real person is waiting on you, because marketing email
> is written to look personal. We store the sender, subject, and a short preview
> so the sorted list persists between sessions. Full message bodies are never
> stored.

**Scene 5 — acting on a message.** Star one, trash another.

> gmail.modify also covers acting on mail. I'll star this one — that's a label
> change. And I'll move this one to Trash.
>
> Every one of these happens only when the user taps a control. Nothing is ever
> permanently deleted — Trash stays recoverable in Gmail, and the app has its own
> untrash action.

**Scene 6 — reply and send.** Type into the recipient field so autocomplete fires.

> Here I'm replying. As I type the recipient, autocomplete offers addresses —
> that's contacts.other.readonly. It returns people the user has emailed but
> never saved to their contacts, which is exactly who autocomplete is for. We
> chose that narrower scope over full contacts access. Those results go straight
> into this field and are never stored.

Type a short reply, hit Send:

> And sending uses gmail.send. This only ever sends a message the user has
> written and explicitly sent by tapping Send. Nothing is sent automatically, on
> a schedule, or without a direct action.

**Scene 7 — close.** Settings → Send a test notification, if it can be triggered.

> Day Ahead also sends a morning summary notification built from that same
> calendar and inbox data.
>
> That's all four scopes: calendar read-only for the schedule, other contacts for
> reply autocomplete, Gmail send for replies the user writes, and Gmail modify
> for sorting the inbox and acting on it. Thanks for reviewing.

Leave the mistakes in. A clean one-take screen recording with a slightly rough
voiceover reads as genuine; a polished edit costs an afternoon and earns nothing.

## The demo video — requirements

Required for restricted scopes, and the step people miss. Unlisted YouTube is
fine. Reviewers check it against the justifications above, so it should show, in
order: the consent screen with the scopes visible, the inbox being sorted, a
reply being composed and sent, and a message being starred or trashed.

## Still to do

1. Record and upload the demo video.
2. Submit for verification.
3. Google assigns a CASA tier; engage one of its authorised assessors.

Budget roughly $1–3k for Tier 2, recurring annually. See
[[day-ahead-launch-and-pricing]] for how that lands against the unit economics —
about 30 subscribers covers it.
