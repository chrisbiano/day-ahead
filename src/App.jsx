import { useState, useEffect, useRef } from 'react'
import useTasks from './hooks/useTasks'
import useUserPrefs from './hooks/useUserPrefs'
import { toISODate } from './lib/tasks'
import { supabase, isSupabaseConfigured } from './lib/supabase'
import useCalendarEvents from './hooks/useCalendarEvents'
import useEventNotes from './hooks/useEventNotes'
import useEmails from './hooks/useEmails'
import Layout from './components/Layout'
import GreetingHeader from './components/GreetingHeader'
import StatRow from './components/StatRow'
import Timeline from './components/Timeline'
import WeekView from './components/WeekView'
import MonthView from './components/MonthView'
import SearchResults from './components/SearchResults'
import { weekDays, monthGrid, eventCoversDay } from './lib/dates'
import { carryOverItems, findTodayTarget, todayTargets, agoLabel } from './lib/carryOver'
import { publishWidgetSnapshot } from './lib/widget'
import EmailSection from './components/EmailSection'
import TasksSection from './components/TasksSection'
import SettingsModal from './components/SettingsModal'
import AssistantLauncher from './components/AssistantLauncher'
import MorningBriefCard from './components/MorningBriefCard'
import UndoToast from './components/UndoToast'
import useMorningBrief from './hooks/useMorningBrief'

const SETTINGS_KEY = 'sentinel.settings.v1'

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

/* Resolve a weekday the user named, in code. The model is handed a calendar table
   and STILL drifts on compound phrasing — "Tuesday of next week" came back as the
   Wednesday. A date is arithmetic, so we do the arithmetic and overrule it.

   Only fires when the target day is unambiguous:
   - a weekday right after a direction word ("into Tuesday", "to Friday"), or
   - for create/duplicate, a single weekday anywhere in the sentence.
   "push my Tuesday meeting to 4pm" names a weekday that is NOT the target, which
   is why the bare-weekday case is limited to intents that are setting a day. */
function resolveWeekdayDate(text, todayISO, intent) {
  const s = String(text || '').toLowerCase()
  const named = WEEKDAYS.filter(w => new RegExp(`\\b${w}s?\\b`).test(s))
  if (named.length === 0) return null

  const directed = s.match(
    new RegExp(`\\b(?:to|on|for|into|until|till)\\s+(?:next\\s+|the\\s+)?(${WEEKDAYS.join('|')})\\b`),
  )
  let day = directed?.[1]
  if (!day) {
    if (named.length !== 1) return null                       // two weekdays, genuinely ambiguous
    if (intent !== 'duplicate' && intent !== 'create') return null
    day = named[0]
  }

  const target = WEEKDAYS.indexOf(day)
  const base = new Date(`${todayISO}T00:00:00`)
  const dow = base.getDay()
  // "next week" means the week starting the coming Sunday — so "Tuesday of next
  // week" on a Friday is that Sunday + 2, not simply "the next Tuesday".
  const nextWeek = /\bnext\s+week\b/.test(s) || new RegExp(`\\bnext\\s+${day}\\b`).test(s)
  let delta
  if (nextWeek) {
    delta = (7 - dow) + target
  } else {
    delta = (target - dow + 7) % 7
    if (delta === 0) delta = 7                                // "Tuesday" said on a Tuesday = the next one
  }
  const d = new Date(base)
  d.setDate(d.getDate() + delta)
  return toISODate(d)
}
// theme: 'dark' | 'light' | 'auto'. Defaults to dark — the app has always been
// dark, so an existing user's look never changes without them asking.
const defaultSettings = { hideCompleted: false, theme: 'dark' }

export default function App() {
  const {
    tasks,
    addTask,
    updateTask,
    deleteTask,
    deleteSeries,
    duplicateTask,
    reorderTasks,
    deletedTasks,
    restoreTask,
    deleteSubtask,
    restoreSubtask,
    deletedSubtasks,
    undoableDelete,
    undoDelete,
    dismissUndoDelete,
    toggleReminder,
    snoozeTask,
    unsnoozeTask,
    toggleComplete,
    toggleSubtask,
    refresh: refreshTasks,
    error: taskError,
    clearError: clearTaskError,
    loading: tasksLoading,
    parkLeftovers: parkTaskLeftovers,
    resolveLeftover: resolveTaskLeftover,
    leftoverSubtasks: taskLeftovers,
  } = useTasks()

  // Captures the browser timezone (so the morning brief lands at 7am local) and
  // holds the brief on/off toggle.
  const { morningBrief, setMorningBrief, briefTime, setBriefTime } = useUserPrefs()

  // The morning brief lives as a card at the top of the dashboard until dismissed.
  const { brief, loading: briefLoading, show: showBrief, dismiss: dismissBrief, refresh: refreshBrief } =
    useMorningBrief({ enabled: morningBrief, briefTime })

  const [settings, setSettings] = useState(() => {
    try {
      const saved = localStorage.getItem(SETTINGS_KEY)
      if (saved) return { ...defaultSettings, ...JSON.parse(saved) }
    } catch (e) {
      // ignore
    }
    return defaultSettings
  })

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    } catch (e) {
      // non-fatal
    }
  }, [settings])

  // Apply the chosen theme. 'auto' removes the attribute so the CSS
  // prefers-color-scheme block takes over — and we listen for OS changes so it
  // flips live. The browser-UI colours are kept in step with the palette.
  useEffect(() => {
    const pick = settings.theme || 'dark'
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const apply = () => {
      const root = document.documentElement
      if (pick === 'auto') root.removeAttribute('data-theme')
      else root.setAttribute('data-theme', pick)
      const light = pick === 'light' || (pick === 'auto' && mq.matches)
      document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', light ? 'light' : 'dark')
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', light ? '#fafafa' : '#0B0B0C')
    }
    apply()
    if (pick !== 'auto') return
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [settings.theme])

  const [showGreeting, setShowGreeting] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [notice, setNotice] = useState(null)

  // Google bounces back here after connecting a mailbox — surface the result,
  // then clean the params out of the URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const connected = params.get('connected')
    const err = params.get('connect_error')
    if (!connected && !err) return
    setNotice(
      connected
        ? { kind: 'ok', text: `Connected ${connected}` }
        : { kind: 'err', text: `Couldn't connect that account (${err})` }
    )
    // Reopen Settings on return — a fresh account needs its purpose note and
    // signature check, and both live here. Landing on the bare dashboard would
    // hide that the note even exists.
    setSettingsOpen(true)
    window.history.replaceState({}, '', window.location.pathname)
  }, [])

  // Real mail across every connected account, sorted by Claude into reply /
  // read / unsubscribe / junk. Claude only ever sorts; acting is always a click.
  const {
    emails,
    loading: emailsLoading,
    remaining: emailsRemaining,
    error: emailError,
    accountErrors: emailAccountErrors,
    clearError: clearEmailError,
    act: actOnEmail,
    dismiss: dismissEmail,
    markHandled: markEmailHandled,
    reclassify: reclassifyEmail,
    toggleFlag: toggleEmailFlag,
    markTaskAdded: markEmailTaskAdded,
    undoable: emailUndoable,
    undo: undoEmail,
    dismissUndo: dismissEmailUndo,
    refresh: refreshEmails,
  } = useEmails()

  // Real events from every connected Google Calendar, merged onto the timeline.
  // Day Ahead always opens on today, in day view; you navigate away deliberately.
  const [selectedDate, setSelectedDate] = useState(() => new Date())
  const [view, setView] = useState('day')
  const selectedISO = toISODate(selectedDate)

  // Each view fetches exactly the span it shows.
  const week = weekDays(selectedDate)
  const month = monthGrid(selectedDate)
  const rangeStart = view === 'week' ? week[0] : view === 'month' ? month[0] : selectedDate
  const rangeEnd = view === 'week' ? week[6] : view === 'month' ? month[month.length - 1] : selectedDate

  const {
    events,
    loading: calendarLoading,
    error: calendarError,
    refresh: refreshCalendar,
  } = useCalendarEvents(rangeStart, rangeEnd)

  const dayEvents = events.filter(e => eventCoversDay(e, selectedISO))

  // Day Ahead-side prep checklists layered onto calendar blocks.
  const {
    notes: eventNotes,
    addSubtask: addEventSubtask,
    toggleSubtask: toggleEventSubtask,
    removeSubtask: removeEventSubtask,
    setSubtasks: setEventSubtasks,
    restoreSubtask: restoreEventSubtask,
    refresh: refreshEventNotes,
    deletedSubtasks: deletedEventSubtasks,
    toggleDone: toggleEventDone,
    toggleHidden: toggleEventHidden,
    backfillContext,
    loading: eventNotesLoading,
    parkLeftovers: parkEventLeftovers,
    resolveLeftover: resolveEventLeftover,
    leftoverSubtasks: eventLeftovers,
  } = useEventNotes()

  const [search, setSearch] = useState('')
  const searching = search.trim().length > 0

  // Tapping a reminder deep-links to its task. The service worker sends the id
  // (via ?task= on a cold open, or a postMessage when a window's already up); we
  // jump to that task's day and flash it. `tasks` may still be loading, so the
  // resolve effect below re-runs when it arrives.
  const [highlightTaskId, setHighlightTaskId] = useState(null)
  const [pendingTaskId, setPendingTaskId] = useState(() => {
    try { return new URLSearchParams(window.location.search).get('task') } catch { return null }
  })

  useEffect(() => {
    const onMsg = (e) => {
      if (e.data?.type === 'open-task' && e.data.taskId) setPendingTaskId(String(e.data.taskId))
    }
    navigator.serviceWorker?.addEventListener('message', onMsg)
    return () => navigator.serviceWorker?.removeEventListener('message', onMsg)
  }, [])

  // Older notes are missing their event context; fill it in whenever the real
  // event is on screen, so they become searchable without any action from you.
  useEffect(() => {
    if (events.length) backfillContext(events)
  }, [events, backfillContext])

  const reviewAll = () => {
    document.getElementById('working-area')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const scrollToSection = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // Canonical "h:mm AM/PM" from whatever the model emitted ("2:30", "14:30",
  // "2:30pm"). A bare hour with no meridiem gets the daytime reading — "2:30"
  // means 2:30 PM; nobody schedules 2:30 AM by accident.
  const normalizeTime = (s) => {
    const m = String(s || '').trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?$/i)
    if (!m) return String(s || '') || null
    let h = Number(m[1])
    const mm = m[2] ?? '00'
    const ap = m[3]?.toLowerCase()
    if (ap) {
      h = h % 12
      if (ap.startsWith('p')) h += 12
    } else if (h <= 6) {
      h += 12
    }
    const h12 = h % 12 === 0 ? 12 : h % 12
    return `${h12}:${mm} ${h < 12 || h === 24 ? 'AM' : 'PM'}`
  }

  // The A.I. assistant: send a plain-language note plus a compact roster of open
  // tasks; Claude returns ONE structured command — create / update / complete /
  // duplicate — which the launcher shows for confirmation. Nothing applies
  // without a tap. Refs (not ids) round-trip through the model; mapped back here.
  const runAssistant = async (text) => {
    const now = new Date()
    const todayISO = toISODate(now)
    // Open tasks plus the last few days' COMPLETED ones — "add my X from today
    // to tomorrow" is most natural right after finishing X, so done tasks stay
    // referenceable (the model sees them marked done and can duplicate them).
    const doneCutoff = toISODate(new Date(Date.now() - 3 * 86_400_000))
    const candidates = [
      ...tasks.filter(t => !t.completed),
      ...tasks.filter(t => t.completed && t.date && t.date >= doneCutoff),
    ]
    // A daily repeat materializes ~90 open occurrences — left alone they flood
    // the 60-slot roster and push everything else out (this actually happened).
    // Collapse each series to one representative: its nearest occurrence on or
    // after today, else its latest past one.
    const bySeries = new Map()
    for (const t of candidates) {
      if (!t.seriesId) continue
      const cur = bySeries.get(t.seriesId)
      const better = !cur
        || (t.date >= todayISO && (cur.date < todayISO || t.date < cur.date))
        || (t.date < todayISO && cur.date < todayISO && t.date > cur.date)
      if (better) bySeries.set(t.seriesId, t)
    }
    // Nearest-to-today first, so the 60 cap can never cut today's tasks.
    const dist = (iso) => Math.abs(new Date(`${iso ?? todayISO}T00:00:00`) - new Date(`${todayISO}T00:00:00`))
    const rosterTasks = candidates
      .filter(t => !t.seriesId || bySeries.get(t.seriesId) === t)
      .sort((a, b) => dist(a.date) - dist(b.date))
      .slice(0, 60)
    // Calendar events go in too. They're read-only (we never write to Google),
    // but the assistant has to KNOW they exist — asking it to duplicate one used
    // to fail with "no such task", which is true but useless, because events were
    // simply invisible to it. Limited to the range currently loaded on screen.
    const rosterEvents = (events ?? [])
      .filter(e => e.title)
      .sort((a, b) => dist(a.date) - dist(b.date))
      .slice(0, 25)
    const rosterItems = [
      ...rosterTasks.map(t => ({ ...t, kind: 'task' })),
      // Carry each block's checklist along — an event's subtasks live in its
      // notes row, not on the event, so they have to be attached here or a
      // duplicate arrives empty.
      ...rosterEvents.map(e => ({ ...e, kind: 'event', subtasks: eventNotes[e.id]?.subtasks || [] })),
    ]
    // Subtask TITLES now, not just a count — without them it can't act on "check
    // off the export step". Capped and trimmed so a long checklist can't crowd
    // out the rest of the roster. Reminder and repeat state ride along too: both
    // were invisible, so it couldn't answer or change either.
    const roster = rosterItems.map((it, i) => ({
      ref: i, kind: it.kind, title: it.title, date: it.date, time: it.time,
      durationMin: it.duration, completed: it.kind === 'task' ? it.completed : false,
      subtasks: (it.subtasks || [])
        .filter(s => !s.deletedAt)
        .slice(0, 8)
        .map(s => ({ title: String(s.title || '').slice(0, 60), done: Boolean(s.done) })),
      subtaskCount: (it.subtasks || []).filter(s => !s.deletedAt).length,
      hasReminder: it.kind === 'task' ? Boolean(it.hasReminder) : false,
      reminderLeadMin: it.kind === 'task' ? (it.reminderLeadMin || 0) : 0,
      repeats: it.kind === 'task' ? Boolean(it.seriesId) : false,
    }))
    // Precompute the local calendar so the model looks dates up instead of
    // calculating them — "what date is Friday?" is exactly the arithmetic LLMs
    // get wrong (copies were landing a day off). It copies an exact date from here.
    const upcoming = Array.from({ length: 21 }, (_, i) => {
      const d = new Date(now); d.setDate(d.getDate() + i)
      return { date: toISODate(d), weekday: d.toLocaleDateString('en-US', { weekday: 'long' }) }
    })
    const { data, error } = await supabase.functions.invoke('parse-task', {
      body: {
        text,
        today: toISODate(now),
        weekday: now.toLocaleDateString('en-US', { weekday: 'long' }),
        nowTime: now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
        tasks: roster,
        upcoming,
      },
    })
    if (error || data?.error) {
      let msg = data?.error
      if (error) {
        try { const b = await error.context?.json?.(); msg = b?.message || b?.error || error.message } catch { msg = error.message }
      }
      throw new Error(msg || 'Could not read that')
    }
    // Older deployed function returns { task } (create-only) — treat it as a
    // create command so the assistant keeps working until the new one ships.
    if (!data.command && data.task) {
      const p = data.task
      return { intent: 'create', title: p.title, date: p.date, time: p.time, durationMin: p.durationMin, subtasks: p.subtasks || [], reminder: p.reminder, note: '', task: null }
    }
    const c = data.command
    const src = c.taskRef >= 0 ? (rosterItems[c.taskRef] ?? null) : null
    // copySubtasks needs a second item: the one the checklist lands on.
    const target = c.targetRef >= 0 ? (rosterItems[c.targetRef] ?? null) : null
    // Defensive time hygiene, whatever the model emitted: canonical AM/PM form,
    // and a duplicate whose time matches the source's clock reading (meridiem
    // aside) means "same time" — drop it so the original's time is kept.
    let time = c.time ? normalizeTime(c.time) : null
    if (c.intent === 'duplicate' && time && src?.time) {
      const clock = (x) => String(x).replace(/\s*[AP]\.?M\.?$/i, '').trim()
      if (clock(time) === clock(src.time)) time = null
    }
    // A weekday the user named beats whatever the model worked out.
    const weekdayDate = resolveWeekdayDate(text, todayISO, c.intent)
    const finalDate = weekdayDate ?? c.date
    // The note is the model's own prose, so it still quotes the date IT chose —
    // which we may have just overruled, leaving the card contradicting itself.
    // Rewrite any date it wrote (with the weekday it may have prefixed) to the
    // date actually being used, in readable form instead of raw ISO.
    let note = c.note || ''
    if (note && finalDate) {
      const pretty = new Date(`${finalDate}T00:00:00`).toLocaleDateString(undefined, {
        weekday: 'short', month: 'short', day: 'numeric',
      })
      // Swallow a weekday sitting in front of the date — full or abbreviated —
      // or "Tue, 2026-08-05" would come out as "Tue, Tue, Aug 4".
      const DAY_WORD = `${WEEKDAYS.join('|')}|sun|mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat`
      note = note.replace(
        new RegExp(`(?:\\b(?:${DAY_WORD})\\b\\.?,?\\s+)?\\d{4}-\\d{2}-\\d{2}`, 'gi'),
        pretty,
      )
    }
    return { ...c, date: finalDate, time, note, task: src, target }
  }

  // Append new subtasks to something that already exists. Handles either store —
  // a task's own array, or a calendar block's notes row.
  const handleAddSubtasks = async (target, titles) => {
    const clean = (titles || []).map(t => String(t || '').trim()).filter(Boolean)
    if (!target || clean.length === 0) throw new Error('Nothing to add.')
    const newSubId = () =>
      (crypto?.randomUUID ? crypto.randomUUID() : `s${Date.now()}${Math.random().toString(36).slice(2, 6)}`)
    const additions = clean.map(t => ({ id: newSubId(), title: t, done: false }))
    const existing = (target.subtasks || []).filter(s => !s.deletedAt)

    if (target.kind === 'event') {
      setEventSubtasks(
        { id: target.id, title: target.title, date: target.date, time: target.time },
        [...existing, ...additions],
      )
    } else {
      await updateTask(target.id, { subtasks: [...existing, ...additions] })
    }
    focusOn(target)
  }

  // Delete by voice. Soft, like every other delete — it lands in "Deleted today"
  // and is restorable. Calendar events aren't ours to delete.
  const handleAssistantDelete = async (task) => {
    if (!task) throw new Error('Nothing to delete.')
    if (task.kind === 'event') {
      throw new Error(`“${task.title}” is a calendar event — delete it in Google Calendar.`)
    }
    await deleteTask(task.id)
  }

  // Turn a reminder on or off, optionally with a lead time. Reminders hang off a
  // start time, so an untimed task has nothing to fire against.
  const handleAssistantReminder = async (task, on, leadMin) => {
    if (!task) throw new Error('Nothing to change.')
    if (task.kind === 'event') {
      throw new Error(`“${task.title}” is a calendar event — reminders only work on tasks.`)
    }
    if (on && !task.time) {
      throw new Error(`“${task.title}” has no start time, so a reminder has nothing to fire against.`)
    }
    const patch = { hasReminder: Boolean(on) }
    if (on && Number(leadMin) > 0) patch.reminderLeadMin = Number(leadMin)
    await updateTask(task.id, patch)

    // Read it back. Task updates write to the server in the background and only
    // log on failure, so a confirm card can report success while the row never
    // changed — which is exactly what happened. Verify against the DB and say so
    // if it disagrees, rather than trusting the local copy.
    if (isSupabaseConfigured) {
      const { data, error } = await supabase
        .from('tasks').select('has_reminder, reminder_lead_min, remind_at')
        .eq('id', task.id).single()
      if (error) throw new Error(`Couldn't confirm the change saved: ${error.message}`)
      if (Boolean(data?.has_reminder) !== Boolean(on)) {
        throw new Error(
          `The server still shows the reminder ${data?.has_reminder ? 'ON' : 'OFF'} for “${task.title}”. Nothing was saved.`,
        )
      }
      if (on && !data?.remind_at) {
        throw new Error(
          `Reminder set, but no fire time could be worked out for “${task.title}” — check it has a date as well as a time.`,
        )
      }
    }
    focusOn(task)
  }

  // The ↻ button used to pull only the calendar, which is why an edit made on the
  // phone never showed up here — tasks and checklists were whatever this tab
  // loaded at startup. Now it re-pulls everything that can change on the other
  // device.
  /* The header's ↻ — everything the day is built from, in parallel.
     Email belongs here as much as the rest. It was left out when this was
     written for cross-device sync, so new mail only appeared after a full
     reload and the button looked broken to anyone waiting on a message. */
  const refreshEverything = async () => {
    await Promise.all([
      refreshCalendar(),
      refreshTasks(),
      refreshEventNotes(),
      refreshEmails(),
    ])
  }

  // Jump to whatever we just changed and flash it, so a voice command has a
  // visible result rather than happening somewhere off-screen.
  const focusOn = (item) => {
    const day = item?.date ? new Date(`${item.date}T00:00:00`) : null
    if (day && !Number.isNaN(day.getTime())) { setSelectedDate(day); setView('day') }
    if (item?.kind === 'task') {
      setHighlightTaskId(item.id)
      setTimeout(() => setHighlightTaskId(null), 3000)
    }
    setTimeout(() => scrollToSection(item?.time ? 'schedule-section' : 'tasks-section'), 80)
  }

  // "Take my subtasks from X and add them to Y." The model only picks the two
  // items; the real checklist is copied here, from whichever store owns it (a
  // task's own array, or an event's notes row). Copies are fresh and unchecked,
  // and the source keeps its own.
  const handleCopySubtasks = async (source, target) => {
    if (!source || !target) return
    const newSubId = () =>
      (crypto?.randomUUID ? crypto.randomUUID() : `s${Date.now()}${Math.random().toString(36).slice(2, 6)}`)
    const copies = (source.subtasks || [])
      .filter(s => !s.deletedAt)
      .map(s => ({ id: newSubId(), title: s.title, done: false }))
    // Say so rather than closing the card as if it worked — a silent no-op reads
    // exactly like a hang.
    if (copies.length === 0) {
      throw new Error(`“${source.title}” has no subtasks to copy.`)
    }

    const existing = (target.subtasks || []).filter(s => !s.deletedAt)
    if (target.kind === 'event') {
      setEventSubtasks(
        { id: target.id, title: target.title, date: target.date, time: target.time },
        [...existing, ...copies],
      )
    } else {
      await updateTask(target.id, { subtasks: [...existing, ...copies] })
    }

    // Only navigate on a date that actually parses. An Invalid Date landing in
    // selectedDate poisons every range the calendar derives from it.
    const day = target.date ? new Date(`${target.date}T00:00:00`) : null
    if (day && !Number.isNaN(day.getTime())) { setSelectedDate(day); setView('day') }
    setHighlightTaskId(target.kind === 'task' ? target.id : null)
    setTimeout(() => scrollToSection('schedule-section'), 80)
    setTimeout(() => setHighlightTaskId(null), 3000)
  }

  // Deleted subtasks from both stores — a task's own array and an event's notes —
  // flattened to one shape so the list doesn't care where they came from.
  const deletedSubtaskEntries = [
    ...deletedSubtasks.map(d => ({
      key: `t-${d.key}`, title: d.sub.title, parent: d.taskTitle,
      deletedAt: d.sub.deletedAt, restore: () => restoreSubtask(d.taskId, d.sub.id),
    })),
    ...deletedEventSubtasks.map(d => ({
      key: `e-${d.key}`, title: d.sub.title, parent: d.parentTitle,
      deletedAt: d.sub.deletedAt, restore: () => restoreEventSubtask(d.eventId, d.sub.id),
    })),
  ]

  // Undo for a deleted subtask — the quick catch; "Deleted today" is the real net.
  // The Timeline hands us a restore closure so this works for either store.
  const [subtaskUndo, setSubtaskUndo] = useState(null)
  const subtaskUndoTimer = useRef(null)
  useEffect(() => () => { if (subtaskUndoTimer.current) clearTimeout(subtaskUndoTimer.current) }, [])
  const onSubtaskDeleted = (title, restore) => {
    if (subtaskUndoTimer.current) clearTimeout(subtaskUndoTimer.current)
    setSubtaskUndo({ label: `Deleted “${title || 'subtask'}”`, restore })
    subtaskUndoTimer.current = setTimeout(() => setSubtaskUndo(null), 8000)
  }
  const undoSubtaskDelete = () => {
    if (subtaskUndoTimer.current) clearTimeout(subtaskUndoTimer.current)
    subtaskUndo?.restore?.()
    setSubtaskUndo(null)
  }

  // After a duplicate (assistant or button), jump to the day the copy actually
  // landed on and flash it — so a copy sent to another day (e.g. "…to Friday")
  // is visibly there instead of seeming to vanish. Returns the created task so
  // the caller can await it and surface any failure.
  const handleDuplicate = async (task, date, time) => {
    // A calendar event can't be copied onto Google (calendar is read-only), so it
    // lands as a Day Ahead task on the target day — same title, same time, and
    // editable, which is what "put it on Tuesday" actually means in practice.
    const newSubId = () =>
      (crypto?.randomUUID ? crypto.randomUUID() : `s${Date.now()}${Math.random().toString(36).slice(2, 6)}`)
    const created = task?.kind === 'event'
      ? await addTask({
          title: task.title,
          date: date ?? task.date,
          time: time ?? task.time,
          duration: task.duration || 30,
          // Fresh, unchecked copies of the block's checklist — same behaviour as
          // duplicating a task.
          subtasks: (task.subtasks || []).map(s => ({ id: newSubId(), title: s.title, done: false })),
        })
      : await duplicateTask(task, date, time)
    if (created?.date) {
      setSelectedDate(new Date(`${created.date}T00:00:00`))
      setView('day')
    }
    if (created?.id != null) {
      setHighlightTaskId(created.id)
      setTimeout(() => scrollToSection(created.time ? 'schedule-section' : 'tasks-section'), 80)
      setTimeout(() => setHighlightTaskId(null), 3000)
    }
    return created
  }

  // Resolve a reminder deep-link once the task is known: focus its day, scroll to
  // the task list, and flash the task for a few seconds.
  useEffect(() => {
    if (!pendingTaskId) return
    const t = tasks.find(x => String(x.id) === String(pendingTaskId))
    if (!t) return   // tasks still loading — this re-runs when they land
    if (t.date) { setSelectedDate(new Date(`${t.date}T00:00:00`)); setView('day') }
    setSearch('')
    setHighlightTaskId(t.id)
    setPendingTaskId(null)
    try { window.history.replaceState({}, '', window.location.pathname) } catch { /* ignore */ }
    // Timed tasks are on the schedule now, untimed ones in the list — jump to
    // wherever this one actually lives.
    setTimeout(() => scrollToSection(t.time ? 'schedule-section' : 'tasks-section'), 80)
    const clear = setTimeout(() => setHighlightTaskId(null), 3000)
    return () => clearTimeout(clear)
  }, [pendingTaskId, tasks])

  // "This needs an answer, but not right now." Drops a dateless task that rides
  // Today forward until it's checked off — the don't-forget-to-reply net. Marks
  // the email so its + Task button greys out and can't make a duplicate.
  const addEmailToTasks = (email) => {
    if (email.task_created) return
    const who = email.sender || email.sender_email || 'someone'
    const subject = email.subject || '(no subject)'
    addTask({ title: `Reply: ${who} — ${subject}`, date: null })
    markEmailTaskAdded(email)
  }

  // Dated tasks belong to their day. A general task (no date) just lives under
  // Today's tasks until it's done.
  const todayISO = toISODate(new Date())
  const isTodayView = selectedISO === todayISO
  const dayTasks = tasks.filter(t => t.date === selectedISO || (!t.date && isTodayView))
  const visibleTasks = settings.hideCompleted
    ? dayTasks.filter(t => !t.completed)
    : dayTasks
  // Timed tasks live on the schedule only (they have a slot there); the task list
  // is for the untimed "whenever" to-dos. Keeps the two from doubling up.
  const untimedTasks = visibleTasks.filter(t => !t.time)

  /* Keep the home-screen widget in step with today.
     The widget can't fetch, so it shows whatever it was last handed — which
     means a stale snapshot is indistinguishable to the user from a broken
     widget. Republishing whenever today's tasks or events change is what makes
     it trustworthy at a glance. No-ops off iOS. */
  useEffect(() => {
    publishWidgetSnapshot({ tasks, events, todayISO })
  }, [tasks, events, todayISO])

  /* ---- Carryover ----
     Anything still owed on a day that has passed is parked into Carryover: off
     that day (a finished day should list what got done, which is the manual
     cleanup this replaces) and held in one place until it's filed against a
     task or dropped.

     The earlier design forced a destination at the moment you acted, and
     invented a standalone task when nothing matched — which put the item beyond
     the reach of carryover entirely. Parking removes the deadline, so an item
     can sit unfiled without escaping. */
  const swept = useRef(false)
  useEffect(() => {
    if (swept.current || tasksLoading || eventNotesLoading) return
    swept.current = true
    const due = carryOverItems({ tasks, eventNotes, todayISO })
    if (due.length === 0) return
    const byTask = new Map()
    const byEvent = new Map()
    for (const item of due) {
      const bucket = item.source === 'task' ? byTask : byEvent
      if (!bucket.has(item.parentId)) bucket.set(item.parentId, new Set())
      bucket.get(item.parentId).add(item.subtaskId)
    }
    if (byTask.size) parkTaskLeftovers(byTask)
    if (byEvent.size) parkEventLeftovers(byEvent)
  }, [tasksLoading, eventNotesLoading, tasks, eventNotes, todayISO,
    parkTaskLeftovers, parkEventLeftovers])

  const newSubId = () =>
    (crypto?.randomUUID ? crypto.randomUUID() : `s${Date.now()}${Math.random().toString(36).slice(2, 6)}`)

  // Parked items from both stores, most recent first. seriesId comes off the
  // parent so a repeating block still resolves to today's row exactly.
  const carryoverItems = [
    ...taskLeftovers.map(l => ({
      key: `task:${l.parentId}:${l.sub.id}`,
      source: 'task',
      parentId: l.parentId,
      parentTitle: l.parentTitle,
      seriesId: tasks.find(t => t.id === l.parentId)?.seriesId ?? null,
      date: l.date,
      subtaskId: l.sub.id,
      title: l.sub.title,
    })),
    ...eventLeftovers.map(l => ({
      key: `event:${l.parentId}:${l.sub.id}`,
      source: 'event',
      parentId: l.parentId,
      parentTitle: l.parentTitle || 'Calendar block',
      seriesId: null,
      date: l.date,
      subtaskId: l.sub.id,
      title: l.sub.title,
    })),
  ]
    .map(i => ({ ...i, ago: i.date ? agoLabel(i.date, todayISO) : '' }))
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))

  const resolveCarryover = (item) => (item.source === 'task'
    ? resolveTaskLeftover(item.parentId, item.subtaskId)
    : resolveEventLeftover(item.parentId, item.subtaskId))

  // File a parked item against something on today. Only resolve it once the
  // write has landed, so a failure leaves it in Carryover rather than losing it
  // between two places.
  const fileCarryover = async (item, targetKey) => {
    // No destination given means "just put it on today" — the button has to do
    // something every time it's pressed, even on a day with nothing to attach
    // to. It becomes a task of its own rather than silently doing nothing.
    if (!targetKey) {
      try {
        await addTask({ title: item.title, date: todayISO })
      } catch (e) {
        console.error('Filing carryover failed:', e)
        return
      }
      resolveCarryover(item)
      return
    }
    const [kind, ...rest] = String(targetKey).split(':')
    const targetId = rest.join(':')
    try {
      if (kind === 'task') {
        const t = tasks.find(x => x.id === targetId)
        if (!t) return
        await updateTask(targetId, {
          subtasks: [...(t.subtasks || []), { id: newSubId(), title: item.title, done: false }],
        })
      } else {
        const ev = dayEvents.find(e => e.id === targetId)
        if (!ev) return
        setEventSubtasks(
          { id: ev.id, title: ev.title, date: ev.date, time: ev.time ?? null },
          [...(eventNotes[ev.id]?.subtasks || []), { id: newSubId(), title: item.title, done: false }],
        )
      }
    } catch (e) {
      // updateTask already surfaced this in the error banner.
      console.error('Filing carryover failed:', e)
      return
    }
    resolveCarryover(item)
  }

  const carryOverProps = isTodayView && carryoverItems.length > 0
    ? {
      items: carryoverItems,
      targets: todayTargets({ tasks, events: dayEvents, todayISO }),
      // Where "Add to today" will actually put it — named so the button can say
      // so, rather than leaving the destination a surprise.
      destinationFor: (item) => {
        const hit = findTodayTarget(item, { tasks, events: dayEvents, todayISO })
        if (hit?.kind === 'task') return { key: `task:${hit.task.id}`, label: hit.task.title }
        if (hit?.kind === 'event') return { key: `event:${hit.event.id}`, label: hit.event.title }
        return null
      },
      onFile: fileCarryover,
      onDrop: resolveCarryover,
    }
    : null

  return (
    <Layout
      onOpenSettings={() => setSettingsOpen(true)}
      onRefresh={refreshEverything}
      // Mail is the slowest of the four; spinning only on the calendar meant the
      // button stopped while the thing you were waiting for was still loading.
      refreshing={calendarLoading || emailsLoading}
    >
      <main className="space-y-6">
        {/* Daily brief — pinned at the very top until dismissed. */}
        {showBrief && (
          <MorningBriefCard brief={brief} loading={briefLoading} onRefresh={refreshBrief} onDismiss={dismissBrief} />
        )}

        {/* A save that failed should say so, not quietly vanish */}
        {taskError && (
          <div className="card card-border-accent flex items-center justify-between gap-4">
            <p className="text-sm text-fg">
              Couldn't save that task — {taskError}
            </p>
            <button
              onClick={clearTaskError}
              className="text-xs text-faint hover:text-fg transition-colors shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Result of a "connect account" round-trip */}
        {notice && (
          <div className="card flex items-center justify-between gap-4">
            <p className={`text-sm ${notice.kind === 'ok' ? 'text-fg' : 'text-muted'}`}>
              {notice.text}
            </p>
            <button
              onClick={() => setNotice(null)}
              className="text-xs text-faint hover:text-fg transition-colors shrink-0"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Compact greeting bar */}
        {showGreeting && (
          <GreetingHeader
            onReviewAll={reviewAll}
            onDismiss={() => setShowGreeting(false)}
          />
        )}

        {/* At-a-glance stats for the day you're looking at */}
        <StatRow
          tasks={dayTasks}
          events={dayEvents}
          emails={emails}
          isToday={isTodayView}
          onTasksClick={() => scrollToSection('tasks-section')}
          onEmailsClick={() => scrollToSection('emails-section')}
        />

        {/* Search everything on record — tasks, annotated blocks, their subtasks */}
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-faint pointer-events-none">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
            </svg>
          </span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search your work — e.g. “Champions for Growth”"
            className="input w-full pl-10 pr-16"
          />
          {searching && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-faint hover:text-fg transition-colors"
            >
              Clear
            </button>
          )}
        </div>

        {/* Searching takes over the schedule area; clearing returns you to it. */}
        {searching ? (
          <SearchResults
            tasks={tasks}
            eventNotes={eventNotes}
            query={search}
            onChangeDate={(d) => { setSelectedDate(d); setView('day'); setSearch('') }}
          />
        ) : view === 'day' ? (
          <div id="schedule-section" className="scroll-mt-20">
          <Timeline
            tasks={visibleTasks}
            events={dayEvents}
            onToggleSubtask={toggleSubtask}
            calendarLoading={calendarLoading}
            calendarError={calendarError}
            eventNotes={eventNotes}
            onAddEventSubtask={addEventSubtask}
            onToggleEventSubtask={toggleEventSubtask}
            onRemoveEventSubtask={removeEventSubtask}
            onSetEventSubtasks={setEventSubtasks}
            onToggleEventDone={toggleEventDone}
            onToggleEventHidden={toggleEventHidden}
            onUpdateTask={updateTask}
            onSubtaskDeleted={onSubtaskDeleted}
            onDeleteSubtask={deleteSubtask}
            onRestoreSubtask={restoreSubtask}
            onRestoreEventSubtask={restoreEventSubtask}
            onToggleReminder={toggleReminder}
            onSnooze={snoozeTask}
            onUnsnooze={unsnoozeTask}
            onDelete={deleteTask}
            onDeleteSeries={deleteSeries}
            highlightId={highlightTaskId}
            selectedDate={selectedDate}
            onChangeDate={setSelectedDate}
            defaultDate={selectedISO}
            onAddTask={addTask}
            onToggleComplete={toggleComplete}
            view={view}
            onChangeView={setView}
            carryOver={carryOverProps}
          />
          </div>
        ) : view === 'week' ? (
          <WeekView
            tasks={tasks}
            events={events}
            selectedDate={selectedDate}
            onChangeDate={setSelectedDate}
            onAddTask={addTask}
            onToggleComplete={toggleComplete}
            view={view}
            onChangeView={setView}
            calendarLoading={calendarLoading}
            calendarError={calendarError}
          />
        ) : (
          <MonthView
            tasks={tasks}
            events={events}
            selectedDate={selectedDate}
            onChangeDate={setSelectedDate}
            view={view}
            onChangeView={setView}
            calendarLoading={calendarLoading}
            calendarError={calendarError}
          />
        )}

        {/* Two-column working area. Each side is its own scroll anchor so the
            stat tiles up top can jump straight to it. */}
        <div id="working-area" className="grid grid-cols-1 lg:grid-cols-2 gap-6 scroll-mt-20">
          <div id="tasks-section" className="scroll-mt-20">
            <TasksSection
              tasks={untimedTasks}
              deletedTasks={deletedTasks}
              onRestore={restoreTask}
              deletedSubtasks={deletedSubtaskEntries}
              onToggleReminder={toggleReminder}
              onSnooze={snoozeTask}
              onUnsnooze={unsnoozeTask}
              onToggleComplete={toggleComplete}
              onAdd={addTask}
              onUpdate={updateTask}
              onDelete={deleteTask}
              onDeleteSeries={deleteSeries}
              onDuplicate={handleDuplicate}
              onReorder={reorderTasks}
              highlightId={highlightTaskId}
              defaultDate={selectedISO}
            />
          </div>
          <div id="emails-section" className="scroll-mt-20">
            <EmailSection
              emails={emails}
              loading={emailsLoading}
              remaining={emailsRemaining}
              error={emailError}
              accountErrors={emailAccountErrors}
              onAct={actOnEmail}
              onDismiss={dismissEmail}
              onMarkHandled={markEmailHandled}
              onReclassify={reclassifyEmail}
              onFlag={toggleEmailFlag}
              onAddToTasks={addEmailToTasks}
              onClearError={clearEmailError}
            />
          </div>
        </div>
      </main>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onChange={setSettings}
        morningBrief={morningBrief}
        onMorningBriefChange={setMorningBrief}
        briefTime={briefTime}
        onBriefTimeChange={setBriefTime}
      />

      {/* Floating A.I. assistant — bottom-left, always in reach. Creates, edits,
          and completes tasks from plain language; everything confirmed by a tap. */}
      <AssistantLauncher
        onCommand={runAssistant}
        onAdd={addTask}
        onUpdate={updateTask}
        onComplete={toggleComplete}
        onDuplicate={handleDuplicate}
        onCopySubtasks={handleCopySubtasks}
        onAddSubtasks={handleAddSubtasks}
        onAssistantDelete={handleAssistantDelete}
        onSetReminder={handleAssistantReminder}
        defaultDate={selectedISO}
      />

      <UndoToast
        undoable={emailUndoable}
        onUndo={undoEmail}
        onDismiss={dismissEmailUndo}
      />

      {/* Undo for a just-deleted task — same net the email actions have. */}
      <UndoToast
        undoable={undoableDelete ? { label: `Deleted “${undoableDelete.task.title}”` } : null}
        onUndo={undoDelete}
        onDismiss={dismissUndoDelete}
      />

      {/* Undo for a deleted subtask — its only net, since subtasks can't be
          soft-deleted into "Recently deleted". */}
      <UndoToast
        undoable={subtaskUndo}
        onUndo={undoSubtaskDelete}
        onDismiss={() => setSubtaskUndo(null)}
      />
    </Layout>
  )
}
