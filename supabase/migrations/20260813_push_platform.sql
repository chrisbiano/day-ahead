-- Day Ahead — let push_subscriptions hold native iOS device tokens alongside
-- Web Push subscriptions.
--
-- Web Push and APNs identify a device differently:
--   web → an endpoint URL plus two encryption keys (p256dh, auth)
--   iOS → a bare APNs device token, and nothing else
--
-- Rather than a second table, the token goes in `endpoint` and `platform` says
-- how to read it. The existing UNIQUE (user_id, endpoint) then does the right
-- thing for both, and the delete-account cascade keeps working untouched.
--
-- Written idempotently so it is safe to re-run.

alter table public.push_subscriptions
  add column if not exists platform text not null default 'web';

-- iOS rows have no encryption keys, so these can no longer be mandatory.
-- The check constraint below keeps them mandatory for web rows, which is where
-- the NOT NULL was actually earning its keep.
alter table public.push_subscriptions alter column p256dh drop not null;
alter table public.push_subscriptions alter column auth   drop not null;

alter table public.push_subscriptions
  drop constraint if exists push_subscriptions_platform_check;
alter table public.push_subscriptions
  add constraint push_subscriptions_platform_check
  check (platform in ('web', 'ios'));

-- A web row without its keys is undeliverable; an iOS row carrying keys means
-- something wrote the wrong shape. Both are bugs worth failing loudly on.
alter table public.push_subscriptions
  drop constraint if exists push_subscriptions_keys_check;
alter table public.push_subscriptions
  add constraint push_subscriptions_keys_check check (
    (platform = 'web' and p256dh is not null and auth is not null)
    or
    (platform = 'ios' and p256dh is null and auth is null)
  );

-- The send path always reads by user, and now branches on platform.
create index if not exists push_subscriptions_user_platform_idx
  on public.push_subscriptions (user_id, platform);
