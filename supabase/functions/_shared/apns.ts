// Day Ahead — Apple Push Notification service client.
//
// Web Push has a library; APNs does not, at least not one worth pulling into an
// edge function. What it needs is small: an ES256 JWT signed with the .p8 key
// Apple issues, and an HTTP/2 POST per device. Both are in the platform already
// (Web Crypto signs, Deno's fetch negotiates h2), so this file is the whole
// integration.
//
// Secrets, all from the Apple Developer account:
//   APNS_KEY_ID       the 10-character Key ID of the .p8
//   APNS_TEAM_ID      the 10-character Team ID
//   APNS_PRIVATE_KEY  the .p8 file's contents, PEM and all
//   APNS_TOPIC        the bundle id — app.dayahead
//
// Absent those, isApnsConfigured() is false and callers skip the iOS path
// entirely. That is the state until the developer account is active, and it is
// deliberately not an error: web push must keep working meanwhile.

const KEY_ID = Deno.env.get('APNS_KEY_ID')
const TEAM_ID = Deno.env.get('APNS_TEAM_ID')
const PRIVATE_KEY = Deno.env.get('APNS_PRIVATE_KEY')
const TOPIC = Deno.env.get('APNS_TOPIC') || 'app.dayahead'

export const isApnsConfigured = () =>
  Boolean(KEY_ID && TEAM_ID && PRIVATE_KEY)

const PROD = 'https://api.push.apple.com'
const SANDBOX = 'https://api.sandbox.push.apple.com'

/* ---------- the provider token ---------- */

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const b64urlText = (s: string) => b64url(new TextEncoder().encode(s))

/** Strip the PEM armour and decode to the DER bytes importKey wants. */
function pemToDer(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\s+/g, '')
  const raw = atob(body)
  const der = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) der[i] = raw.charCodeAt(i)
  return der
}

/* Apple caps provider tokens at one hour and rejects a client that mints them
   more often than once every 20 minutes, so the token is cached and reused.
   Refreshing at 50 minutes sits comfortably inside both limits. */
let cached: { token: string; madeAt: number } | null = null
const TOKEN_TTL_MS = 50 * 60 * 1000

async function providerToken(): Promise<string> {
  const now = Date.now()
  if (cached && now - cached.madeAt < TOKEN_TTL_MS) return cached.token

  const iat = Math.floor(now / 1000)
  const signingInput =
    `${b64urlText(JSON.stringify({ alg: 'ES256', kid: KEY_ID }))}.` +
    `${b64urlText(JSON.stringify({ iss: TEAM_ID, iat }))}`

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(PRIVATE_KEY!),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
  // Web Crypto returns the raw r‖s pair, which is exactly the JWS ES256
  // signature format — no DER unwrapping needed.
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key,
      new TextEncoder().encode(signingInput)),
  )

  const token = `${signingInput}.${b64url(sig)}`
  cached = { token, madeAt: now }
  return token
}

/** Forget the cached token. Used when Apple rejects it as expired. */
const resetToken = () => { cached = null }

/* ---------- delivery ---------- */

export interface ApnsPayload {
  title: string
  body: string
  url?: string
  tag?: string
}

export interface ApnsResult {
  ok: boolean
  /** True when Apple says this token will never work again — caller deletes it. */
  dead: boolean
  status: number
  reason?: string
}

function buildBody(p: ApnsPayload) {
  return JSON.stringify({
    aps: {
      alert: { title: p.title, body: p.body },
      sound: 'default',
      // Lets iOS replace an earlier notification about the same thing rather
      // than stacking duplicates, matching the web behaviour of `tag`.
      'thread-id': p.tag ?? 'day-ahead',
    },
    // Read by the app when the notification is tapped, so a reminder can open
    // the thing it is about.
    url: p.url ?? '/',
  })
}

async function post(host: string, token: string, body: string, jwt: string) {
  const res = await fetch(`${host}/3/device/${token}`, {
    method: 'POST',
    headers: {
      authorization: `bearer ${jwt}`,
      'apns-topic': TOPIC,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'content-type': 'application/json',
    },
    body,
  })
  // Apple returns an empty body on success and JSON {reason} on failure.
  let reason: string | undefined
  if (res.status !== 200) {
    try { reason = (await res.json())?.reason } catch { /* no body */ }
  } else {
    await res.body?.cancel()
  }
  return { status: res.status, reason }
}

/*
 * A device token is only valid in the environment that issued it: a build
 * installed from Xcode gets a sandbox token, TestFlight and the App Store get
 * production ones. Nothing in the token says which, and the app cannot reliably
 * report it either.
 *
 * So: try production, and if Apple says BadDeviceToken, try sandbox. The retry
 * costs one round trip on development devices only, and it means the same
 * deployment serves a phone plugged into Xcode and a real App Store install
 * without a flag to set or a secret to remember to flip at launch.
 */
export async function sendApns(deviceToken: string, payload: ApnsPayload): Promise<ApnsResult> {
  if (!isApnsConfigured()) {
    return { ok: false, dead: false, status: 0, reason: 'APNsNotConfigured' }
  }

  const body = buildBody(payload)
  let jwt = await providerToken()
  let r = await post(PROD, deviceToken, body, jwt)

  // An expired provider token is worth exactly one retry with a fresh one.
  if (r.status === 403 && r.reason === 'ExpiredProviderToken') {
    resetToken()
    jwt = await providerToken()
    r = await post(PROD, deviceToken, body, jwt)
  }

  if (r.status === 400 && r.reason === 'BadDeviceToken') {
    r = await post(SANDBOX, deviceToken, body, jwt)
  }

  // Unregistered: the app was deleted. BadDeviceToken after both environments:
  // the token is malformed or for another app. Neither will ever succeed.
  const dead =
    r.status === 410 ||
    (r.status === 400 && r.reason === 'BadDeviceToken')

  if (r.status !== 200) {
    console.error('APNs', r.status, r.reason ?? '(no reason)')
  }
  return { ok: r.status === 200, dead, status: r.status, reason: r.reason }
}
