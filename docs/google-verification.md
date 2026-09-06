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

## Scopes and why each is needed

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

## The demo video

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
