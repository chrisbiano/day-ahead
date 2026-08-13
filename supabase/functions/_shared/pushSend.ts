// Day Ahead — deliver one notification to every device on an account,
// whichever kind of device it is.
//
// This used to exist twice, once in push-send and once in scheduler-tick, and
// they had already drifted apart in their error handling. Adding a second
// delivery protocol to both copies was not a thing worth doing, so the send
// path lives here now and both callers import it.
//
// A user can legitimately have both kinds of row at once — the phone app and a
// desktop browser — so this never chooses between them. It sends to all of them
// and reports what happened.

import webpush from 'npm:web-push@3.6.7'
import { sendApns, isApnsConfigured } from './apns.ts'

const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:chris@fastrosecreative.com'

export interface PushPayload {
  title: string
  body: string
  url?: string
  tag?: string
  /* Web-only: re-alert even though a notification with this tag is already on
     screen. iOS has no equivalent — a repeat reminder simply arrives again. */
  renotify?: boolean
}

export interface SendResult {
  devices: number
  sent: number
  removed: number
}

/**
 * @param vapidPublicKey  Optional override. push-send takes it from the caller
 *   so the frontend's key and the server's private half are provably a pair;
 *   scheduler-tick has no caller and uses the env var.
 */
export async function sendToUser(
  admin: any,
  userId: string,
  payload: PushPayload,
  vapidPublicKey?: string,
): Promise<SendResult> {
  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth, platform')
    .eq('user_id', userId)

  const rows = subs ?? []
  if (!rows.length) return { devices: 0, sent: 0, removed: 0 }

  const webKey = vapidPublicKey || VAPID_PUBLIC_KEY
  const webUsable = Boolean(webKey && VAPID_PRIVATE_KEY)
  if (webUsable) webpush.setVapidDetails(VAPID_SUBJECT, webKey!, VAPID_PRIVATE_KEY!)

  const body = JSON.stringify(payload)
  const dead: string[] = []
  let sent = 0

  // Devices are independent; one unreachable phone should not delay the others.
  await Promise.all(rows.map(async (s: any) => {
    try {
      if (s.platform === 'ios') {
        if (!isApnsConfigured()) return
        const r = await sendApns(s.endpoint, payload)
        if (r.ok) sent++
        else if (r.dead) dead.push(s.id)
        return
      }

      if (!webUsable) return
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        body,
      )
      sent++
    } catch (e: any) {
      // 404 gone, 410 expired — this browser subscription is finished.
      if (e?.statusCode === 404 || e?.statusCode === 410) dead.push(s.id)
      else console.error('push error', s.platform, e?.statusCode, e?.body || e?.message)
    }
  }))

  if (dead.length) await admin.from('push_subscriptions').delete().in('id', dead)

  return { devices: rows.length, sent, removed: dead.length }
}
