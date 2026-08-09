/* Leftovers — subtasks planned on an earlier day and never finished.
 *
 * Tasks are selected by exact date (dayTasks in App), so an unfinished subtask
 * doesn't merely lose priority when the date rolls over: it leaves the screen
 * entirely. The old workaround was to copy the remaining steps onto the next
 * day by hand, which only works on the days you remember to do it — and the
 * days you run out of time are exactly the days you don't.
 *
 * So they come to you instead. Anything still owed on a day that has passed is
 * PARKED into Carryover: cleared off that day (a finished day should list what
 * was accomplished, not a mix of wins and misses) and held in one place until
 * it's matched to a task or dropped.
 *
 * Parking is what closes the hole in the first design, which forced a
 * destination at the moment you acted and invented a standalone task when
 * nothing matched — putting the item beyond the reach of this system entirely.
 * Carryover has no deadline, so an item can wait unrouted without escaping.
 *
 * This module finds what to park and where a parked item could go; the hooks
 * own the parking itself, and the UI decides what to offer.
 *
 * Subtasks live in two places — a task's own `subtasks` array and a calendar
 * block's Day Ahead note — and both are already loaded in full (neither hook
 * filters by date), so this is a pure read over state that's in memory.
 */

/* How far back the sweep reaches when parking. This is NOT how long an item
   survives — once parked it sits in Carryover until it's dealt with, however
   long that takes. The window only bounds what gets pulled in from history, so
   turning the feature on doesn't suddenly rake up months of old misses. 30 days
   matches the retention the app already uses for deleted tasks and subtasks. */
export const CARRY_LOOKBACK_DAYS = 30

// ISO day arithmetic anchored at local noon, so a DST jump can't land the
// result on the neighbouring day.
export function shiftISO(iso, delta) {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + delta)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/* Still owed: not done and not deleted.
   Dealing with a leftover soft-deletes it from the day it was planned — a
   finished day should list what actually got done and nothing else, which is
   the habit this replaces (copy forward, then go back and delete the misses).
   `deletedAt` is what the rest of the app already uses to hide a subtask while
   keeping it restorable, so there's no second concept here. */
export function isPending(sub) {
  return Boolean(sub) && !sub.done && !sub.deletedAt
}

/* 'Yesterday' beats 'Thu' at one day out; inside the week the weekday is the
   useful handle. Older than that a weekday is ambiguous — and a parked item can
   sit for a long time — so it falls back to a date. */
export function agoLabel(iso, todayISO) {
  if (iso === shiftISO(todayISO, -1)) return 'Yesterday'
  const d = new Date(`${iso}T12:00:00`)
  if (iso > shiftISO(todayISO, -7)) return d.toLocaleDateString(undefined, { weekday: 'short' })
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/**
 * Unfinished subtasks from before `todayISO`, newest day first, with each one's
 * parent so it stays identifiable out of context.
 *
 * Returns items of:
 *   { key, source: 'task'|'event', parentId, parentTitle, parentTime, seriesId,
 *     date, ago, subtaskId, title }
 */
export function carryOverItems({
  tasks = [],
  eventNotes = {},
  todayISO,
  lookbackDays = CARRY_LOOKBACK_DAYS,
} = {}) {
  if (!todayISO) return []
  const floor = lookbackDays == null ? null : shiftISO(todayISO, -lookbackDays)
  const inWindow = (date) =>
    Boolean(date) && date < todayISO && (floor === null || date >= floor)
  const out = []

  for (const t of tasks) {
    if (t.deletedAt || !inWindow(t.date)) continue
    for (const s of t.subtasks || []) {
      if (!isPending(s)) continue
      out.push({
        key: `task:${t.id}:${s.id}`,
        source: 'task',
        parentId: t.id,
        parentTitle: t.title,
        parentTime: t.time ?? null,
        seriesId: t.seriesId ?? null,
        date: t.date,
        ago: agoLabel(t.date, todayISO),
        subtaskId: s.id,
        title: s.title,
      })
    }
  }

  for (const [eventId, note] of Object.entries(eventNotes)) {
    if (!inWindow(note?.date)) continue
    for (const s of note.subtasks || []) {
      if (!isPending(s)) continue
      out.push({
        key: `event:${eventId}:${s.id}`,
        source: 'event',
        parentId: eventId,
        parentTitle: note.title || 'Calendar block',
        parentTime: note.time ?? null,
        seriesId: null,
        date: note.date,
        ago: agoLabel(note.date, todayISO),
        subtaskId: s.id,
        title: s.title,
      })
    }
  }

  // Most recent first, then grouped by parent so one block's leftovers sit
  // together rather than interleaved with another's.
  return out.sort((a, b) =>
    b.date.localeCompare(a.date) || a.parentTitle.localeCompare(b.parentTitle))
}

/**
 * Everywhere a parked item could be filed today — the day's tasks and its timed
 * calendar blocks. Completed tasks are included on purpose: filing a step under
 * a block you've already wrapped up is a reasonable thing to want, and it's the
 * suggestion logic's job to avoid picking one by default.
 */
export function todayTargets({ tasks = [], events = [], todayISO } = {}) {
  const out = []
  for (const t of tasks) {
    if (t.date !== todayISO || t.deletedAt) continue
    out.push({ key: `task:${t.id}`, label: t.title })
  }
  for (const e of events) {
    if (e.allDay) continue
    out.push({ key: `event:${e.id}`, label: e.title })
  }
  return out
}

/**
 * Where a leftover should land today. A repeating block already has a real row
 * for today (recurrence is materialised, not a rule), so `seriesId` is an exact
 * match when it exists; title is the fallback for one-offs and calendar blocks.
 *
 * Returns { kind: 'task', task } | { kind: 'event', event } | null. A null means
 * nothing matches and the caller should make the leftover a task of its own.
 */
export function findTodayTarget(item, { tasks = [], events = [], todayISO } = {}) {
  const sameTitle = (a, b) =>
    String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()

  if (item.source === 'event') {
    const event = events.find(e => !e.allDay && sameTitle(e.title, item.parentTitle))
    if (event) return { kind: 'event', event }
  }

  const todayTasks = tasks.filter(t => t.date === todayISO && !t.completed && !t.deletedAt)
  const bySeries = item.seriesId && todayTasks.find(t => t.seriesId === item.seriesId)
  const target = bySeries || todayTasks.find(t => sameTitle(t.title, item.parentTitle))
  if (target) return { kind: 'task', task: target }

  // A calendar block that didn't match an event still might match a task of the
  // same name, which the branch above already covered. Nothing left to try.
  return null
}
