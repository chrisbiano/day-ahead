/* What the home-screen widget draws.
 *
 * Split from the native bridge on purpose: this is the part that decides what a
 * glance at your phone shows, and it should be testable without a simulator,
 * an App Group, or Xcode. widget.js owns the crossing into native; this owns
 * the content.
 *
 * The widget is a separate process that cannot fetch anything — it renders
 * whatever it was last handed. So the ordering and filtering here are the only
 * chance to get it right.
 */

/* What the widget gets. Deliberately small: two widget families showing at most
 * a handful of rows, on a surface people glance at. Sending the whole day would
 * cost App Group space and buy nothing.
 *
 * Times are pre-formatted strings rather than timestamps — the widget should
 * render, not compute, and locale formatting already happened here. */

// Local, so this module pulls in nothing. Importing the app's toISODate would
// drag in tasks.js and from there the Supabase client — a whole application
// behind one date format, in a file whose point is being testable alone.
function todayISO() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function buildSnapshot({ tasks = [], events = [], emails = [], todayISO: today = todayISO() }) {
  const items = []

  /* An undated task belongs to today — that is the app's own rule
     (App.jsx: t.date === selectedISO || (!t.date && isTodayView)), and it is
     where the "anytime" work actually lives. Filtering on date === today
     dropped every one of them, so the widget claimed a day had no loose ends
     when it had several. */
  for (const t of tasks) {
    const onToday = t.date === today || !t.date
    if (!onToday || t.completed || t.deletedAt) continue
    items.push({
      title: t.title,
      time: t.time || '',
      kind: t.time ? 'task' : 'anytime',
      done: false,
      subtaskTotal: (t.subtasks || []).filter(s => !s.deletedAt).length,
      subtaskDone: (t.subtasks || []).filter(s => !s.deletedAt && s.done).length,
    })
  }

  for (const e of events) {
    if (e.allDay || e.date !== today) continue
    items.push({ title: e.title, time: e.time || '', kind: 'event', done: false,
      subtaskTotal: 0, subtaskDone: 0 })
  }

  // Chronological, untimed last — the widget's whole job is "what's next".
  items.sort((a, b) => {
    if (!a.time && !b.time) return 0
    if (!a.time) return 1
    if (!b.time) return -1
    return minutesOf(a.time) - minutesOf(b.time)
  })

  /* The medium widget shows a day, not a list: what's booked, what's waiting
     whenever, and whether the inbox needs you. Counting here — with the same
     rule the app's own stat row uses (action === 'reply') — keeps the widget
     from ever disagreeing with the screen it summarises. */
  return {
    date: today,
    updatedAt: new Date().toISOString(),
    items: items.slice(0, 6),
    total: items.length,
    timedTotal: items.filter(i => i.kind !== 'anytime').length,
    anytimeTotal: items.filter(i => i.kind === 'anytime').length,
    needsReply: emails.filter(e => e?.action === 'reply').length,
  }
}

// "2:30 PM" → minutes past midnight. Unparseable sinks to the end rather than
// leaping to the top, same rule the timeline uses.
function minutesOf(t) {
  const m = String(t).match(/(\d+):(\d+)\s*(AM|PM)?/i)
  if (!m) return Number.MAX_SAFE_INTEGER
  let h = Number(m[1]) % 12
  if (/pm/i.test(m[3] || '')) h += 12
  return h * 60 + Number(m[2])
}
