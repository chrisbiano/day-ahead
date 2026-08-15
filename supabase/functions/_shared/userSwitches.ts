// Day Ahead — the two switches a user can throw, read in one place.
//
// `ai_enabled` and `quiet_until` are checked from six different functions. Six
// copies of "select the pref, decide what it means" is how one of them ends up
// treating a missing row as false, and a person who never opened Settings
// silently loses their morning brief.
//
// So the meaning of each switch is decided here, once, and it fails OPEN: if
// the row is missing or the read errors, the user gets the product they signed
// up for. A database hiccup should not quietly turn someone's app into a
// different, quieter app — that failure is invisible, and invisible failures
// are the ones nobody reports.

export interface Switches {
  aiEnabled: boolean
  quiet: boolean
}

/** Both switches for one user. Never throws. */
export async function getSwitches(admin: any, userId: string): Promise<Switches> {
  const { data, error } = await admin
    .from('user_prefs')
    .select('ai_enabled, quiet_until')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    console.error('switch read failed, defaulting to on:', error.message)
    return { aiEnabled: true, quiet: false }
  }
  return {
    aiEnabled: data?.ai_enabled !== false,
    quiet: isQuiet(data?.quiet_until),
  }
}

/** Just the AI switch, for functions that never send notifications. */
export async function aiEnabled(admin: any, userId: string): Promise<boolean> {
  return (await getSwitches(admin, userId)).aiEnabled
}

/*
 * Quiet mode is a moment, not a flag, so it lapses on its own — a switch you
 * have to remember to turn off is how someone misses a fortnight of reminders.
 *
 * 'infinity' is a real timestamptz, and `new Date('infinity')` is NaN rather
 * than something comparable, so it is matched as a string before parsing.
 * Missing that would make "quiet until I say otherwise" read as "not quiet",
 * which is the exact opposite of what the user asked for.
 */
export function isQuiet(quietUntil: string | null | undefined, now = new Date()): boolean {
  if (!quietUntil) return false
  if (quietUntil === 'infinity') return true
  if (quietUntil === '-infinity') return false

  const until = new Date(quietUntil)
  if (isNaN(until.getTime())) {
    // An unparseable value must not silence someone indefinitely.
    console.error('unparseable quiet_until, treating as off:', quietUntil)
    return false
  }
  return until > now
}
