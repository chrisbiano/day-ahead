import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'

/* Per-user prefs the SERVER acts on: the browser's timezone (so the morning
   brief lands at 7am the user's time, not UTC), whether they want it, whether
   the AI runs at all, and whether notifications are silenced.

   The last two matter more than the others because the scheduler runs every
   minute whether or not the app is open — so these have to live in the database,
   not in local state. A client-side toggle would keep right on sending. */

/* Mirrors isQuiet in supabase/functions/_shared/userSwitches.ts. Deliberately
   duplicated: the server decides whether to SEND and must not trust the client,
   while this only decides what the settings panel says. 'infinity' is a real
   Postgres timestamp meaning "until I turn it back on", and new Date('infinity')
   is NaN — so it has to be matched before parsing. */
export function quietNow(quietUntil, now = new Date()) {
  if (!quietUntil) return false
  if (quietUntil === 'infinity') return true
  if (quietUntil === '-infinity') return false
  const until = new Date(quietUntil)
  return !isNaN(until.getTime()) && until > now
}

export default function useUserPrefs() {
  const [morningBrief, setMorningBriefState] = useState(true)
  const [briefTime, setBriefTimeState] = useState('07:00')   // local "HH:MM" the brief sends at
  const [aiEnabled, setAiEnabledState] = useState(true)
  const [quietUntil, setQuietUntilState] = useState(null)
  const userIdRef = useRef(null)
  const started = useRef(false)

  useEffect(() => {
    if (!isSupabaseConfigured || started.current) return
    started.current = true
    ;(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        userIdRef.current = user.id
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
        // Create the row if missing, keep the timezone current (upsert only
        // touches the columns we pass, so the rest keep their values/defaults).
        await supabase.from('user_prefs').upsert(
          { user_id: user.id, timezone: tz, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' },
        )
        const { data } = await supabase
          .from('user_prefs')
          .select('morning_brief, brief_time, ai_enabled, quiet_until')
          .eq('user_id', user.id).single()
        if (data) {
          setMorningBriefState(data.morning_brief)
          if (data.brief_time) setBriefTimeState(String(data.brief_time).slice(0, 5))
          // Only an explicit false disables the AI — a null from a row written
          // before the column existed must not read as "off".
          setAiEnabledState(data.ai_enabled !== false)
          setQuietUntilState(data.quiet_until ?? null)
        }
      } catch (e) {
        console.error('user prefs sync failed:', e)
      }
    })()
  }, [])

  /* One writer for all four. Each setter was otherwise the same six lines with
     a different column name, and the timezone tagging is easy to forget on a
     new one — which would leave the scheduler sending at the wrong hour. */
  const savePref = useCallback((patch, label) => {
    if (!isSupabaseConfigured || !userIdRef.current) return
    supabase.from('user_prefs').upsert(
      {
        user_id: userIdRef.current,
        ...patch,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    ).then(({ error }) => { if (error) console.error(`${label} save failed:`, error) })
  }, [])

  const setMorningBrief = useCallback((on) => {
    setMorningBriefState(on)
    savePref({ morning_brief: on }, 'morning brief')
  }, [savePref])

  const setBriefTime = useCallback((hhmm) => {
    setBriefTimeState(hhmm)
    savePref({ brief_time: hhmm }, 'brief time')
  }, [savePref])

  const setAiEnabled = useCallback((on) => {
    setAiEnabledState(on)
    savePref({ ai_enabled: on }, 'AI setting')
  }, [savePref])

  /** null to resume, an ISO string to lapse automatically, 'infinity' for until-I-say. */
  const setQuietUntil = useCallback((value) => {
    setQuietUntilState(value)
    savePref({ quiet_until: value }, 'quiet mode')
  }, [savePref])

  return {
    morningBrief, setMorningBrief,
    briefTime, setBriefTime,
    aiEnabled, setAiEnabled,
    quietUntil, setQuietUntil,
    isQuiet: quietNow(quietUntil),
  }
}
