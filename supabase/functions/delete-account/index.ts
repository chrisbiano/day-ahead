// Day Ahead — delete a user's account and everything Day Ahead holds about them.
//
// Deploy with "Verify JWT" ON. Needs SUPABASE_SERVICE_ROLE_KEY.
//
// Two modes:
//   preview — count what would go, and change nothing. The confirmation screen
//             shows these numbers, so nobody is asked to accept a consequence
//             described only in the abstract.
//   delete  — revoke Google's grant, then delete the auth user.
//
// WHY DELETING ONE ROW IS ENOUGH
// Every user-owned table references auth.users with ON DELETE CASCADE, and
// account_tokens cascades from connected_accounts. Removing the auth user
// therefore removes tasks, event notes, email verdicts, preferences, push
// subscriptions, templates, connected accounts, tokens, error reports — all of
// it, in one transaction the database enforces. Deleting table by table would
// be a longer list to keep in step with the schema, and a table forgotten in
// that list is a promise quietly broken. The cascade cannot forget.
//
// REVOKING COMES FIRST, AND SEPARATELY
// Deleting our copy of a refresh token does not end Google's grant — the app
// would still be listed in the user's Google account with access it can no
// longer use. So each token is revoked at Google before the rows go. A revoke
// that fails must NOT stop the deletion: a user asking to be forgotten gets
// that regardless, and the failures are reported back so they can finish the
// job at myaccount.google.com if they want to.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...cors, 'Content-Type': 'application/json' },
  })

// Tables counted for the preview. Only used to SHOW the user what they hold —
// the deletion itself relies on the cascade, so a table missing from this list
// is a less honest preview, never data left behind.
const OWNED = [
  'tasks',
  'event_notes',
  'email_verdicts',
  'connected_accounts',
  'push_subscriptions',
  'task_templates',
  'user_prefs',
  'problem_reports',
  'client_errors',
]

async function counts(admin: any, userId: string) {
  const out: Record<string, number> = {}
  await Promise.all(OWNED.map(async (t) => {
    const { count } = await admin
      .from(t).select('*', { count: 'exact', head: true }).eq('user_id', userId)
    out[t] = count ?? 0
  }))
  return out
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '')
  const admin = createClient(SUPABASE_URL!, SERVICE_ROLE!)
  const { data: u, error: uErr } = await admin.auth.getUser(jwt)
  if (uErr || !u?.user) return json({ error: 'unauthorized' }, 401)
  const userId = u.user.id

  let body: any = {}
  try { body = await req.json() } catch { /* none */ }
  const mode = body?.mode

  if (mode === 'preview') {
    return json({ counts: await counts(admin, userId), email: u.user.email })
  }

  if (mode !== 'delete') {
    return json({ error: 'Expected { mode: preview|delete }' }, 400)
  }

  // The client sends back the address it displayed. If it doesn't match the
  // token's user, the screen the person confirmed was describing someone else's
  // account — refuse rather than delete the wrong one.
  if (String(body?.confirmEmail || '').toLowerCase() !== String(u.user.email || '').toLowerCase()) {
    return json({ error: 'That confirmation did not match this account.' }, 409)
  }

  const before = await counts(admin, userId)

  // Revoke every Google grant first, while the tokens still exist.
  const revokeFailures: string[] = []
  const { data: accounts } = await admin
    .from('connected_accounts').select('id, email').eq('user_id', userId)
  for (const acct of accounts ?? []) {
    const { data: tok } = await admin
      .from('account_tokens').select('refresh_token').eq('account_id', acct.id).single()
    if (!tok?.refresh_token) continue
    try {
      const r = await fetch('https://oauth2.googleapis.com/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token: tok.refresh_token }),
        signal: AbortSignal.timeout(10000),
      })
      // 200 = revoked. 400 usually means already invalid, which is fine.
      if (!r.ok && r.status !== 400) revokeFailures.push(acct.email)
    } catch {
      revokeFailures.push(acct.email)
    }
  }

  // One row. The cascade does the rest.
  const { error: delErr } = await admin.auth.admin.deleteUser(userId)
  if (delErr) {
    return json({ error: `Could not delete the account: ${delErr.message}` }, 500)
  }

  return json({ ok: true, deleted: before, revokeFailures })
})
