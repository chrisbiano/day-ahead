/* Token encryption tests.
   Run:  npx esbuild supabase/functions/_shared/tokenCrypto.ts --format=esm --target=es2022 --outfile=/tmp/tokenCrypto.mjs \
         && node tests/tokenCrypto.test.mjs

   Transpiled rather than reimplemented on purpose: this exercises the exact
   source the edge functions run, with a stand-in for Deno.env. */
globalThis.Deno = { env: { get: () => globalThis.__KEY__ } }
const { encryptToken, decryptToken, _resetKeyCache } = await import('/tmp/tokenCrypto.mjs')

let pass = 0, fail = 0
const ok = (n, c) => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}`) }

// Before the secret is set, the code must be a no-op in both directions —
// that's what makes deploying it ahead of the key safe.
globalThis.__KEY__ = ''; _resetKeyCache()
ok('no key: encrypt passes plaintext through', await encryptToken('ya29.secret') === 'ya29.secret')
ok('no key: decrypt passes plaintext through', await decryptToken('ya29.secret') === 'ya29.secret')

globalThis.__KEY__ = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64')
_resetKeyCache()
const secret = '1//0gRefreshTokenWith-Odd_Chars==+/'
const enc = await encryptToken(secret)
ok('encrypts to the v1 envelope', enc.startsWith('v1:') && enc.split(':').length === 3)
ok('ciphertext hides the secret', !enc.includes('RefreshToken'))
ok('round-trips exactly', await decryptToken(enc) === secret)
ok('never double-wraps', await encryptToken(enc) === enc)
ok('legacy plaintext still readable', await decryptToken('old-plain-token') === 'old-plain-token')
ok('fresh IV each time', (await encryptToken(secret)) !== (await encryptToken(secret)))
ok('null and empty survive', await encryptToken(null) === null && await encryptToken('') === '')

// GCM authenticates: a doctored row must fail rather than decrypt to something
// plausible and get sent to Google.
let threw = false
try { await decryptToken(`v1:${enc.split(':')[1]}:${Buffer.from('tampered').toString('base64')}`) } catch { threw = true }
ok('tampered ciphertext throws', threw)

// A lost or rotated key must be loud. Returning the ciphertext would surface as
// an inexplicable 401 from Google instead.
globalThis.__KEY__ = ''; _resetKeyCache()
threw = false
try { await decryptToken(enc) } catch { threw = true }
ok('encrypted value + missing key throws loudly', threw)

globalThis.__KEY__ = Buffer.from(new Uint8Array(16)).toString('base64'); _resetKeyCache()
threw = false
try { await encryptToken('x') } catch { threw = true }
ok('wrong key length rejected', threw)

console.log(`\n  ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
