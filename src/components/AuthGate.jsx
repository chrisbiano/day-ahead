import { useEffect, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import Landing from './Landing'

/* Gates the app behind Google sign-in when Supabase is configured.
   Without env vars, falls through to the app (local-only mode). */

/* Anything cached in localStorage belongs to ONE account, and localStorage is
   shared by every account that signs in on this device. Sign out, sign in as
   someone else, and the previous person's cache is still sitting there — the
   morning brief names their actual meetings, tasks and who is waiting on a
   reply, so it is their day being shown to somebody else.

   The owner is recorded alongside the caches and checked on every auth change,
   so a switch purges them even if the sign-out never fired (an expired session,
   a restored tab). Device preferences like the theme are deliberately NOT in
   this list — those belong to the device, not the account. */
const CACHE_OWNER_KEY = 'sentinel.cacheOwner'
const PER_USER_CACHES = ['sentinel.brief.v1']

function purgeIfOwnerChanged(userId) {
  try {
    const owner = localStorage.getItem(CACHE_OWNER_KEY) || ''
    if (owner === (userId || '')) return
    for (const k of PER_USER_CACHES) localStorage.removeItem(k)
    if (userId) localStorage.setItem(CACHE_OWNER_KEY, userId)
    else localStorage.removeItem(CACHE_OWNER_KEY)
  } catch { /* storage unavailable — nothing cached, nothing to leak */ }
}
export default function AuthGate({ children }) {
  // undefined = still checking; null = signed out; object = signed in.
  const [session, setSession] = useState(isSupabaseConfigured ? undefined : null)

  useEffect(() => {
    if (!isSupabaseConfigured) return
    supabase.auth.getSession().then(({ data }) => {
      purgeIfOwnerChanged(data.session?.user?.id)
      setSession(data.session)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      purgeIfOwnerChanged(s?.user?.id)
      setSession(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  if (!isSupabaseConfigured) return children

  if (session === undefined) {
    return (
      <div className="min-h-screen bg-bg text-muted flex items-center justify-center text-sm">
        Loading…
      </div>
    )
  }

  // Signed out, you get the public page rather than a bare sign-in card — it's
  // also what Google's OAuth reviewer loads when they check the homepage.
  if (!session) return <Landing />

  return children
}
