// Day Ahead — deliver a notification to a user's devices.
//
// Deploy with "Verify JWT" ON. Needs secrets:
//   VAPID_PRIVATE_KEY  (from .vapid.local.txt)  — browsers
//   VAPID_SUBJECT      (e.g. mailto:chris@fastrosecreative.com)
//   APNS_*                                       — the iPhone app, see _shared/apns.ts
// The VAPID public key comes from the caller, which already holds it as
// VITE_VAPID_PUBLIC_KEY, so both halves provably match.
//
// Used for the "ping my phone" test; scheduler-tick sends reminders through the
// same shared path so the two can't drift.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendToUser } from '../_shared/pushSend.ts'
import { isApnsConfigured } from '../_shared/apns.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...cors, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '')
  const admin = createClient(SUPABASE_URL!, SERVICE_ROLE!)
  const { data: u, error: uErr } = await admin.auth.getUser(jwt)
  if (uErr || !u?.user) return json({ error: 'unauthorized' }, 401)

  // The native app has no VAPID key to send, so neither transport is required
  // on its own — but with both missing, nothing can be delivered at all.
  if (!VAPID_PRIVATE_KEY && !isApnsConfigured()) {
    return json({ error: 'Neither Web Push nor APNs is configured on this function' }, 500)
  }

  let body: any = {}
  try { body = await req.json() } catch { /* none */ }
  const { mode, vapidPublicKey } = body

  // A test ping to the caller's own devices.
  if (mode === 'test') {
    const result = await sendToUser(admin, u.user.id, {
      title: 'Day Ahead',
      body: 'Notifications are on for this browser. 🎯',
      tag: 'sentinel-test-web',
      url: '/',
    }, vapidPublicKey, {
      title: 'Day Ahead',
      body: 'Notifications are on for your iPhone. 🎯',
      tag: 'sentinel-test-ios',
      url: '/',
    })

    if (result.devices === 0) {
      return json({ error: 'No devices are subscribed on this account yet.' }, 400)
    }
    return json({ ok: true, ...result })
  }

  return json({ error: 'Unknown mode' }, 400)
})
