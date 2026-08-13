import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { supabase } from './supabase'

/* Notifications on the real iPhone app.
 *
 * The web path (push.js) goes through a service worker and VAPID; none of that
 * exists in a native shell. iOS hands the app an APNs device token instead, and
 * the server pushes to Apple rather than to a browser vendor's endpoint.
 *
 * The two live side by side rather than one replacing the other: a person can
 * run the app on their phone and Day Ahead in a desktop browser, and both should
 * buzz. `platform` on push_subscriptions is what tells the server which is which.
 */

export const isNativePush = () => Capacitor.getPlatform() === 'ios'

/* register() is fire-and-forget — the token arrives later on an event, not as a
   return value. This wraps the pair back into one promise so the settings UI can
   await it and show a real result, with a timeout so a token that never arrives
   surfaces as a message instead of a button stuck spinning. */
function tokenFromRegistration(ms = 15000) {
  return new Promise((resolve, reject) => {
    let done = false
    const finish = (fn, arg) => {
      if (done) return
      done = true
      clearTimeout(timer)
      // Both listeners are one-shot; leaving them attached would fire again on
      // the next token refresh, outside any caller waiting for it.
      PushNotifications.removeAllListeners()
      fn(arg)
    }

    const timer = setTimeout(
      () => finish(reject, new Error('iOS didn’t return a notification token. Check that you’re on a real device and try again.')),
      ms,
    )

    PushNotifications.addListener('registration', (t) => finish(resolve, t.value))
    PushNotifications.addListener('registrationError', (e) =>
      finish(reject, new Error(e?.error || 'iOS refused to register this device for notifications.')))

    PushNotifications.register()
  })
}

export async function enableNativePush() {
  let perm = await PushNotifications.checkPermissions()
  if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') {
    perm = await PushNotifications.requestPermissions()
  }
  if (perm.receive !== 'granted') {
    throw new Error('Notifications are turned off for Day Ahead in iOS Settings.')
  }

  const token = await tokenFromRegistration()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')

  /* p256dh and auth stay null: those are Web Push encryption keys and an APNs
     token has no equivalent. The DB check constraint enforces that shape. */
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: user.id,
      endpoint: token,
      platform: 'ios',
      user_agent: navigator.userAgent,
    },
    { onConflict: 'user_id,endpoint' },
  )
  if (error) throw new Error(`Couldn't save this device: ${error.message}`)
  return token
}

export async function disableNativePush() {
  const token = await currentNativeToken()
  await PushNotifications.unregister().catch(() => {})
  if (token) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', token)
  }
}

/* Is this device registered? iOS has no "read my token back" call, so the answer
   comes from the database: an ios row on this account whose permission is still
   granted. Close enough — and it survives an app reinstall, where the stale row
   gets cleaned up by APNs returning Unregistered on the next send. */
export async function currentNativeToken() {
  const perm = await PushNotifications.checkPermissions().catch(() => null)
  if (perm?.receive !== 'granted') return null

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('push_subscriptions')
    .select('endpoint')
    .eq('user_id', user.id)
    .eq('platform', 'ios')
    .limit(1)
  return data?.[0]?.endpoint ?? null
}

/* Tapping a notification should land on whatever it was about. The payload's
   `url` is set by the server; today everything uses '/', but reminders will want
   to deep-link to a task. Registered once at startup. */
export function listenForNotificationTaps(onOpen) {
  if (!isNativePush()) return
  PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
    const url = action?.notification?.data?.url
    if (url) onOpen?.(url)
  })
}
