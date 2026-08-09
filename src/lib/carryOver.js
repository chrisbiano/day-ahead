/* Leftovers — subtasks planned on an earlier day and never finished.
 *
 * Tasks are selected by exact date (dayTasks in App), so an unfinished subtask
 * doesn't merely lose priority when the date rolls over: it leaves the screen
 * entirely. The old workaround was to copy the remaining steps onto the next
 * day by hand, which only works on the days you remember to do it — and the
 * days you run out of time are exactly the days you don't.
 *
 * So the leftovers come to you instead. This module finds them; the UI decides
 * what to offer.
 *
 * Subtasks live in two places — a task's own `subtasks` array and a calendar
 * block's Day Ahead note — and both are already loaded in full (neither hook
 * filters by date), so this is a pure read over state that's in memory.
 */

// Past this, a carry-over list stops being a to-do and becomes a wall of shame
// you learn to scroll past. Older leftovers are never deleted — just no longer
// carried, and still on the day they belong to.
export const CARRY_LOOKBACK_DAYS = 7

// ISO day arithmetic anchored at local noon, so a DST jump can't land the
// result on the neighbouring day.
export function shiftISO(iso, delta) {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + delta)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/* Still owed: not done, not deleted, and not already dealt with here.
   `carriedAt` is stamped when a leftover is moved forward or waved off. It
   deliberately does NOT mark the subtask done — the record of an unfinished
   Tuesday should stay unfinished. It only means "stop bringing this up". */
export function isPending(sub) {
  return Boolean(sub) && !sub.done && !sub.deletedAt && !sub.carriedAt
}

// 'Yesterday' beats 'Thu' at one day out; past that the weekday is the useful
// handle. Beyond a week it'd be ambiguous, but the lookback stops first.
export function agoLabel(iso, todayISO) {
  if (iso === shiftISO(todayISO, -1)) return 'Yesterday'
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' })
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
  const floor = shiftISO(todayISO, -lookbackDays)
  const inWindow = (date) => Boolean(date) && date < todayISO && date >= floor
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
