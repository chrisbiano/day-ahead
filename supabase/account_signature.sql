-- Day Ahead — the signature that goes out on replies, stored here rather than
-- read from Gmail.
--
-- This used to come from Gmail's own send-as settings, which required the
-- gmail.settings.basic scope. That scope is RESTRICTED, and Google weighs what a
-- scope PERMITS rather than what an app does with it — settings.basic allows
-- changing filters, forwarding and vacation responders. Asking for write access
-- to someone's mail settings in order to read a signature is a bad trade: it
-- enlarges the CASA assessment, costs money, and is exactly the kind of thing a
-- reviewer questions.
--
-- So the signature is pasted in once, per mailbox, and lives here. Same result
-- on the wire, one fewer restricted scope to justify.
--
-- HTML on purpose. A creative professional's signature is their brand — logo,
-- links, a coloured rule — and flattening it to plain text would be worse than
-- not having one. It is the account owner's own markup, sent from their own
-- mailbox to their own recipients, and it is never rendered anywhere another
-- user could see it.
--
-- Run once in the Supabase SQL editor. Safe to re-run.

alter table public.connected_accounts
  add column if not exists signature text;

-- The name recipients see, e.g. "Chris · Fast Rose Creative". Gmail falls back
-- to the account's own default when this is blank, so it stays optional.
alter table public.connected_accounts
  add column if not exists display_name text;

-- No new policy needed: "own accounts - update" from account_purpose.sql already
-- scopes updates to auth.uid(), and it is row-level, so it covers new columns.
-- Tokens remain unreachable — account_tokens still has RLS on with no policies.
