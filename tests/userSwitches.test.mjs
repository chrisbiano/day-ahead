/* Tests for supabase/functions/_shared/userSwitches.ts
 *
 * Two properties matter here and neither is visible when it breaks.
 *
 * Failing OPEN: if the preference can't be read, the user must keep the product
 * they signed up for. The opposite failure — a database hiccup quietly turning
 * someone's app silent — produces no error, no alert, and no complaint, because
 * from the outside it just looks like the app stopped bothering them.
 *
 * Quiet mode lapsing: it's a moment rather than a flag precisely so it expires
 * on its own. If 'infinity' parsed wrong, "quiet until I say otherwise" would
 * read as "not quiet" — the exact opposite of what was asked for.
 *
 * Run: node --experimental-strip-types tests/userSwitches.test.mjs
 */
import assert from 'node:assert'
import { pathToFileURL } from 'node:url'

const { isQuiet, getSwitches, aiEnabled } = await import(
  pathToFileURL(new URL('../supabase/functions/_shared/userSwitches.ts', import.meta.url).pathname).href
)

let passed = 0, failed = 0
async function test(name, fn) {
  try { await fn(); console.log(`  ✓ ${name}`); passed++ }
  catch (e) { console.log(`  ✗ ${name}\n      ${e.message}`); failed++ }
}

const quiet = async (fn) => {
  const e = console.error
  console.error = () => {}
  try { return await fn() } finally { console.error = e }
}

/** Minimal stand-in for the supabase client, shaped like the one call we make. */
function fakeAdmin(result) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => result }),
      }),
    }),
  }
}

const NOW = new Date('2026-08-14T12:00:00Z')

console.log('\nQuiet mode')

await test('is off when never set', () => {
  assert.strictEqual(isQuiet(null, NOW), false)
  assert.strictEqual(isQuiet(undefined, NOW), false)
  assert.strictEqual(isQuiet('', NOW), false)
})

await test('is on while the moment is still ahead', () => {
  assert.strictEqual(isQuiet('2026-08-14T18:00:00Z', NOW), true)
})

await test('lapses on its own once the moment passes', () => {
  // The whole reason this is a timestamp and not a boolean.
  assert.strictEqual(isQuiet('2026-08-14T09:00:00Z', NOW), false)
})

await test('is off at the exact moment it expires', () => {
  assert.strictEqual(isQuiet('2026-08-14T12:00:00Z', NOW), false)
})

await test('honours infinity as "until I turn it back on"', () => {
  // Postgres stores this literally; new Date('infinity') is NaN, so a naive
  // comparison would silently un-silence someone who asked for indefinite.
  assert.strictEqual(isQuiet('infinity', NOW), true)
})

await test('treats -infinity as off', () => {
  assert.strictEqual(isQuiet('-infinity', NOW), false)
})

await test('does NOT silence someone on an unparseable value', async () => {
  await quiet(() => {
    assert.strictEqual(isQuiet('not a date', NOW), false)
    assert.strictEqual(isQuiet('2026-13-45', NOW), false)
  })
})

console.log('\nReading both switches')

await test('defaults to on when the user has no prefs row', async () => {
  const s = await getSwitches(fakeAdmin({ data: null, error: null }), 'u1')
  assert.strictEqual(s.aiEnabled, true, 'someone who never opened Settings keeps the AI')
  assert.strictEqual(s.quiet, false)
})

await test('fails OPEN when the read errors', async () => {
  const s = await quiet(() =>
    getSwitches(fakeAdmin({ data: null, error: { message: 'connection reset' } }), 'u1'))
  assert.strictEqual(s.aiEnabled, true, 'a DB blip must not disable the product')
  assert.strictEqual(s.quiet, false, 'a DB blip must not silence notifications')
})

await test('respects an explicit no', async () => {
  const s = await getSwitches(
    fakeAdmin({ data: { ai_enabled: false, quiet_until: 'infinity' }, error: null }), 'u1')
  assert.strictEqual(s.aiEnabled, false)
  assert.strictEqual(s.quiet, true)
})

await test('treats a null ai_enabled as on, not off', async () => {
  // Rows written before the column existed backfill to the default, but a NULL
  // slipping through must not read as "disabled".
  const s = await getSwitches(fakeAdmin({ data: { ai_enabled: null, quiet_until: null }, error: null }), 'u1')
  assert.strictEqual(s.aiEnabled, true)
})

await test('aiEnabled() agrees with getSwitches()', async () => {
  const admin = fakeAdmin({ data: { ai_enabled: false, quiet_until: null }, error: null })
  assert.strictEqual(await aiEnabled(admin, 'u1'), false)
  assert.strictEqual(await aiEnabled(fakeAdmin({ data: null, error: null }), 'u1'), true)
})

console.log(`\n${passed} passed, ${failed} failed\n`)
process.exit(failed ? 1 : 0)
