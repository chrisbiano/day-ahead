import { supabase, isSupabaseConfigured } from './supabase'

/* Crash reporting, in-house.
 *
 * The point: after launch you are no longer the one who finds the bugs. This
 * catches render errors, uncaught exceptions and rejected promises, and files
 * them in `client_errors` with the build id, so a problem someone else hits
 * shows up without them having to report it.
 *
 * Hard rule: logging must never break the app. Everything here is wrapped, and
 * a failure to report is swallowed on purpose. */

const MAX_PER_SESSION = 12     // a render loop could otherwise write thousands
const seen = new Set()         // don't file the same crash twice in one session
let sent = 0
let userId = null

// Vite bakes this in; guard the reference so it can't throw where it isn't defined.
const BUILD = typeof __BUILD_ID__ !== 'undefined' ? String(__BUILD_ID__) : null

export async function reportError(err, source = 'manual', context = null) {
  try {
    if (!isSupabaseConfigured) return

    const message = String(err?.message || err || 'Unknown error').slice(0, 500)
    const stack = err?.stack ? String(err.stack).slice(0, 4000) : null
    const key = `${source}|${message}|${(stack || '').slice(0, 200)}`
    if (seen.has(key) || sent >= MAX_PER_SESSION) return
    seen.add(key)
    sent += 1

    // Rows are owned by their user (RLS); with nobody signed in there's no one
    // to attach it to, so drop it rather than fail.
    if (!userId) {
      const { data } = await supabase.auth.getUser()
      userId = data?.user?.id ?? null
    }
    if (!userId) return

    await supabase.from('client_errors').insert({
      user_id: userId,
      message,
      stack,
      source,
      url: `${window.location.pathname}${window.location.search}`,
      build: BUILD,
      user_agent: navigator.userAgent,
      context: context ?? null,
    })
  } catch {
    /* never let the reporter itself surface an error */
  }
}

/* A problem someone reports in their own words. Crashes only cover things that
   BREAK; this covers "that did the wrong thing", which is most of what actually
   goes wrong. Unlike reportError this one THROWS on failure — the person is
   watching and deserves to know it didn't send. */
export async function submitReport(message) {
  if (!isSupabaseConfigured) throw new Error('Not connected — reports need a signed-in account.')
  const text = String(message || '').trim()
  if (!text) throw new Error('Tell me what happened first.')

  const { data } = await supabase.auth.getUser()
  const uid = data?.user?.id
  if (!uid) throw new Error('You need to be signed in to send a report.')

  const { error } = await supabase.from('problem_reports').insert({
    user_id: uid,
    message: text.slice(0, 4000),
    build: BUILD,
    url: `${window.location.pathname}${window.location.search}`,
    user_agent: navigator.userAgent,
  })
  if (error) throw new Error(error.message || 'Could not send that report.')
}

/* Catch what React's error boundary can't see: anything thrown outside render,
   and promises nobody awaited (a failed fetch, a rejected Supabase call). */
export function startErrorLogging() {
  if (typeof window === 'undefined') return
  window.addEventListener('error', (e) => {
    reportError(e.error || e.message, 'window', e.filename ? { file: e.filename, line: e.lineno } : null)
  })
  window.addEventListener('unhandledrejection', (e) => {
    reportError(e.reason, 'promise')
  })
}
