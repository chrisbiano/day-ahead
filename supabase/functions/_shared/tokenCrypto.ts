/* Encrypt Google tokens before they touch the database.
 *
 * WHAT THIS DEFENDS AGAINST, AND WHAT IT DOESN'T
 * account_tokens already has RLS on with no policies, so no browser can read it
 * whatever happens — that is the strong protection and it is unchanged. What
 * this adds is defence against the row itself escaping: a leaked database
 * backup, a mistaken dump, or a stolen service_role key. The service_role key
 * can read every table over PostgREST, but it cannot read a function's
 * environment, so the key that decrypts these lives somewhere the database
 * credential cannot reach. That separation is the whole point.
 *
 * It is NOT protection against a compromised edge function: code running with
 * the key can decrypt. Nothing available here would change that.
 *
 * AES-256-GCM, a fresh 96-bit IV per value, stored as `v1:<iv>:<ciphertext>`.
 * GCM authenticates as well as encrypts, so a tampered row fails to decrypt
 * rather than yielding a plausible wrong token.
 *
 * MIGRATION, WHICH IS WHY THE PASSTHROUGHS EXIST
 * Deploying encryption to eleven functions and setting the key are separate
 * moments, and rows written before either are plaintext. So:
 *   - no key configured → encrypt returns the value unchanged. Deploying the
 *     code ahead of the secret changes nothing and breaks nothing.
 *   - a value without the `v1:` prefix → decrypt returns it unchanged. Existing
 *     rows keep working and are re-encrypted the next time they're written.
 * The one case that must be loud is a `v1:` value with no key to open it: that
 * means the secret was lost or rotated, and returning the ciphertext would send
 * garbage to Google and surface as a baffling 401. It throws instead.
 */

const PREFIX = 'v1:'

let cached: Promise<CryptoKey> | null = null

function keyMaterial(): string {
  // deno-lint-ignore no-explicit-any
  const env = (globalThis as any).Deno?.env
  return env?.get('TOKEN_ENC_KEY') ?? ''
}

function getKey(): Promise<CryptoKey> | null {
  const b64 = keyMaterial()
  if (!b64) return null
  if (!cached) {
    const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    if (raw.length !== 32) {
      throw new Error('TOKEN_ENC_KEY must be 32 bytes (base64 of 256 bits)')
    }
    cached = crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
  }
  return cached
}

const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b))
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX)
}

export async function encryptToken(plain: string | null | undefined): Promise<string | null> {
  if (plain === null || plain === undefined || plain === '') return plain ?? null
  if (isEncrypted(plain)) return plain            // already done; never double-wrap
  const kp = getKey()
  if (!kp) return plain                           // no key yet — stay plaintext, stay working
  const key = await kp
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain)),
  )
  return `${PREFIX}${toB64(iv)}:${toB64(ct)}`
}

export async function decryptToken(stored: string | null | undefined): Promise<string | null> {
  if (stored === null || stored === undefined || stored === '') return stored ?? null
  if (!isEncrypted(stored)) return stored         // legacy plaintext row
  const kp = getKey()
  if (!kp) {
    throw new Error('Stored token is encrypted but TOKEN_ENC_KEY is not set on this function')
  }
  const [, ivB64, ctB64] = stored.split(':')
  if (!ivB64 || !ctB64) throw new Error('Stored token is malformed')
  const key = await kp
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(ivB64) }, key, fromB64(ctB64),
  )
  return new TextDecoder().decode(plain)
}

/* Migrate a row in place, the first time anything reads it.
 *
 * Turning encryption on doesn't retrofit the rows already there, and a refresh
 * token is only rewritten when a mailbox is reconnected — which might be never.
 * A separate backfill script would need the key, which lives only in a
 * function's environment, so it would have to be a function anyway, run by hand,
 * and remembered. This just does it: any plaintext row gets sealed the next time
 * a function opens it, so the migration completes by itself as the app is used.
 *
 * Failures here must never break the request the caller actually made, so they
 * are caught — but they are LOGGED, not swallowed. The first version swallowed
 * them, and when the key turned out to be malformed the only symptom was rows
 * quietly staying plaintext: no error anywhere, nothing to search for, three
 * rounds of guessing before a probe found it. A caught error with no trace is a
 * bug that cannot be reported.
 */
// deno-lint-ignore no-explicit-any
export async function upgradeStoredToken(admin: any, accountId: string, tok: any) {
  try {
    if (!getKey()) return                                   // no key: nothing to do
    const patch: Record<string, string> = {}
    if (tok?.refresh_token && !isEncrypted(tok.refresh_token)) {
      patch.refresh_token = (await encryptToken(tok.refresh_token))!
    }
    if (tok?.access_token && !isEncrypted(tok.access_token)) {
      patch.access_token = (await encryptToken(tok.access_token))!
    }
    if (Object.keys(patch).length === 0) return
    const { error } = await admin.from('account_tokens').update(patch).eq('account_id', accountId)
    if (error) console.error('Token upgrade write failed:', error.message)
  } catch (e) {
    // Caught so the caller's request still succeeds, but never silent.
    console.error('Token upgrade failed:', e instanceof Error ? e.message : String(e))
  }
}

// Test seam: the key is imported once and cached, so a test changing the
// environment needs a way to drop it.
export function _resetKeyCache() { cached = null }
