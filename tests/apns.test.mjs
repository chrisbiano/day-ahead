/* Tests for supabase/functions/_shared/apns.ts
 *
 * This exercises the real module, not a copy of it: Node 24 strips the type
 * annotations, and the two things the file needs from Deno — env vars and fetch
 * — are stubbed before it loads. That matters because the parts most likely to
 * be wrong here are invisible until a phone is in hand: whether the provider
 * token is actually a valid ES256 JWT, and whether a token that will never work
 * is correctly told apart from one that failed for a passing reason.
 *
 * Getting the second wrong deletes a working device and silently stops that
 * person's reminders, which is the kind of bug nobody reports — they just think
 * the app stopped bothering.
 *
 * Run: node --experimental-strip-types tests/apns.test.mjs
 */
import assert from 'node:assert'
import { webcrypto as crypto } from 'node:crypto'
import { pathToFileURL } from 'node:url'

const MODULE = pathToFileURL(
  new URL('../supabase/functions/_shared/apns.ts', import.meta.url).pathname,
).href

const KEY_ID = 'ABCD123456'
const TEAM_ID = 'TEAM123456'
const TOPIC = 'app.dayahead'
const DEVICE = 'a'.repeat(64)

let passed = 0, failed = 0
async function test(name, fn) {
  try { await fn(); console.log(`  ✓ ${name}`); passed++ }
  catch (e) { console.log(`  ✗ ${name}\n      ${e.message}`); failed++ }
}

/* ---------- a real P-256 key, so signatures can actually be verified ---------- */

const pair = await crypto.subtle.generateKey(
  { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'],
)
const pkcs8 = Buffer.from(await crypto.subtle.exportKey('pkcs8', pair.privateKey))
const PEM = `-----BEGIN PRIVATE KEY-----\n${
  pkcs8.toString('base64').match(/.{1,64}/g).join('\n')
}\n-----END PRIVATE KEY-----\n`

/* ---------- harness ---------- */

let calls = []
let responses = []

/** Load a fresh copy of the module with the given env. */
async function load(env = {}) {
  calls = []
  responses = []
  globalThis.Deno = {
    env: {
      get: (k) => ({
        APNS_KEY_ID: KEY_ID,
        APNS_TEAM_ID: TEAM_ID,
        APNS_PRIVATE_KEY: PEM,
        APNS_TOPIC: TOPIC,
        ...env,
      })[k],
    },
  }
  globalThis.fetch = async (url, opts) => {
    calls.push({ url, opts })
    const next = responses.shift() ?? { status: 200 }
    return {
      status: next.status,
      json: async () => (next.reason ? { reason: next.reason } : {}),
      body: { cancel: async () => {} },
    }
  }
  // Cache-busted so each test gets its own module state (the token cache).
  return import(`${MODULE}?v=${Math.random()}`)
}

const jwtOf = (call) => call.opts.headers.authorization.replace('bearer ', '')

function decode(part) {
  return JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString())
}

/* ---------- the provider token ---------- */

console.log('\nAPNs provider token')

await test('is a valid ES256 JWT that verifies against the key', async () => {
  const { sendApns } = await load()
  await sendApns(DEVICE, { title: 'T', body: 'B' })

  const [h, p, s] = jwtOf(calls[0]).split('.')
  const header = decode(h)
  const payload = decode(p)

  assert.strictEqual(header.alg, 'ES256', 'alg must be ES256')
  assert.strictEqual(header.kid, KEY_ID, 'header carries the Key ID')
  assert.strictEqual(payload.iss, TEAM_ID, 'issuer is the Team ID')
  assert.ok(Math.abs(payload.iat - Math.floor(Date.now() / 1000)) < 5, 'iat is now')

  // The signature must be raw r‖s (64 bytes), not DER — Apple rejects DER.
  const sig = Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
  assert.strictEqual(sig.length, 64, `signature should be 64 raw bytes, got ${sig.length}`)

  const ok = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey, sig,
    Buffer.from(`${h}.${p}`),
  )
  assert.ok(ok, 'signature does not verify — Apple would return 403')
})

await test('is reused across sends rather than re-minted', async () => {
  const { sendApns } = await load()
  await sendApns(DEVICE, { title: 'A', body: 'B' })
  await sendApns(DEVICE, { title: 'C', body: 'D' })
  // Apple rejects a client that mints tokens more often than once per 20 min.
  assert.strictEqual(jwtOf(calls[0]), jwtOf(calls[1]), 'token should be cached')
})

await test('is re-minted once when Apple says it expired', async () => {
  const { sendApns } = await load()
  responses = [{ status: 403, reason: 'ExpiredProviderToken' }, { status: 200 }]
  const r = await sendApns(DEVICE, { title: 'T', body: 'B' })

  assert.strictEqual(calls.length, 2, 'should retry exactly once')
  assert.notStrictEqual(jwtOf(calls[0]), jwtOf(calls[1]), 'retry must use a fresh token')
  assert.ok(r.ok, 'the retry succeeded, so the send succeeded')
  assert.ok(!r.dead, 'an expired provider token says nothing about the device')
})

/* ---------- the request ---------- */

console.log('\nRequest shape')

await test('posts to the device path with the required headers', async () => {
  const { sendApns } = await load()
  await sendApns(DEVICE, { title: 'T', body: 'B' })

  const { url, opts } = calls[0]
  assert.strictEqual(url, `https://api.push.apple.com/3/device/${DEVICE}`)
  assert.strictEqual(opts.method, 'POST')
  assert.strictEqual(opts.headers['apns-topic'], TOPIC, 'topic must be the bundle id')
  assert.strictEqual(opts.headers['apns-push-type'], 'alert')
  assert.strictEqual(opts.headers['apns-priority'], '10')
})

await test('builds an aps payload iOS will display', async () => {
  const { sendApns } = await load()
  await sendApns(DEVICE, { title: '⏰ Ship it', body: 'Due at 3:00 PM', tag: 'task-7', url: '/t/7' })

  const body = JSON.parse(calls[0].opts.body)
  assert.strictEqual(body.aps.alert.title, '⏰ Ship it')
  assert.strictEqual(body.aps.alert.body, 'Due at 3:00 PM')
  assert.strictEqual(body.aps.sound, 'default')
  assert.strictEqual(body.aps['thread-id'], 'task-7', 'tag groups repeat reminders')
  assert.strictEqual(body.url, '/t/7', 'the app reads this on tap')
})

await test('defaults the tap target rather than omitting it', async () => {
  const { sendApns } = await load()
  await sendApns(DEVICE, { title: 'T', body: 'B' })
  const body = JSON.parse(calls[0].opts.body)
  assert.strictEqual(body.url, '/')
  assert.strictEqual(body.aps['thread-id'], 'day-ahead')
})

/* ---------- which failures kill a device ---------- */

console.log('\nFailure handling')

const quiet = async (fn) => {
  const e = console.error
  console.error = () => {}
  try { return await fn() } finally { console.error = e }
}

await test('falls back to sandbox when production rejects the token', async () => {
  const { sendApns } = await load()
  responses = [{ status: 400, reason: 'BadDeviceToken' }, { status: 200 }]
  const r = await quiet(() => sendApns(DEVICE, { title: 'T', body: 'B' }))

  assert.strictEqual(calls.length, 2, 'should try both environments')
  assert.ok(calls[1].url.startsWith('https://api.sandbox.push.apple.com/'),
    'the retry must go to the sandbox host')
  assert.ok(r.ok, 'an Xcode-installed build delivers via sandbox')
  assert.ok(!r.dead, 'it worked — the row must survive')
})

await test('marks dead only when BOTH environments reject the token', async () => {
  const { sendApns } = await load()
  responses = [{ status: 400, reason: 'BadDeviceToken' }, { status: 400, reason: 'BadDeviceToken' }]
  const r = await quiet(() => sendApns(DEVICE, { title: 'T', body: 'B' }))
  assert.ok(!r.ok)
  assert.ok(r.dead, 'nothing will ever make this token work')
})

await test('marks dead when the app was uninstalled (410)', async () => {
  const { sendApns } = await load()
  responses = [{ status: 410, reason: 'Unregistered' }]
  const r = await quiet(() => sendApns(DEVICE, { title: 'T', body: 'B' }))
  assert.ok(r.dead, '410 Unregistered means the app is gone')
})

await test('does NOT mark dead on a rate limit', async () => {
  const { sendApns } = await load()
  responses = [{ status: 429, reason: 'TooManyRequests' }]
  const r = await quiet(() => sendApns(DEVICE, { title: 'T', body: 'B' }))
  assert.ok(!r.ok, 'it did not send')
  assert.ok(!r.dead, 'deleting a throttled device would silently end its reminders')
})

await test('does NOT mark dead when the key itself is misconfigured', async () => {
  const { sendApns } = await load()
  // A wrong Team ID rejects every device. Treating that as dead would wipe the
  // entire table on the first tick after a bad deploy.
  responses = [{ status: 403, reason: 'InvalidProviderToken' }]
  const r = await quiet(() => sendApns(DEVICE, { title: 'T', body: 'B' }))
  assert.ok(!r.ok)
  assert.ok(!r.dead, 'a server-side misconfiguration must not delete devices')
})

await test('is inert, not broken, before the Apple account exists', async () => {
  const { sendApns, isApnsConfigured } = await load({ APNS_PRIVATE_KEY: undefined })
  assert.strictEqual(isApnsConfigured(), false)
  const r = await sendApns(DEVICE, { title: 'T', body: 'B' })
  assert.strictEqual(r.reason, 'APNsNotConfigured')
  assert.strictEqual(calls.length, 0, 'must not call Apple with no credentials')
})

console.log(`\n${passed} passed, ${failed} failed\n`)
process.exit(failed ? 1 : 0)
