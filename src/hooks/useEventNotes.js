import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabase'

const uid = () => Math.random().toString(36).slice(2, 9)
const EMPTY = { subtasks: [], done: false, hidden: false, title: null, date: null, time: null }

/* Day Ahead's own annotations on Google Calendar events — a prep checklist and a
   "wrapped up" flag. Calendar access is read-only, so none of this is written
   back to the user's calendar.
 *
 * Each note also stores the event's title/date/time, so an annotated block is
 * self-describing: it stays a readable, searchable record even if the account is
 * disconnected or the event is later deleted in Google. */
export default function useEventNotes() {
  const [notes, setNotes] = useState({})   // { [eventId]: { subtasks, done, title, date, time } }
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const notesRef = useRef(notes)
  const userIdRef = useRef(null)

  useEffect(() => { notesRef.current = notes }, [notes])

  useEffect(() => {
    if (!isSupabaseConfigured) { setLoading(false); return }
    let cancelled = false
    ;(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { if (!cancelled) setLoading(false); return }
        userIdRef.current = user.id

        const { data, error } = await supabase
          .from('event_notes')
          .select('event_id, subtasks, done, hidden, title, date, time')
        if (error) throw error

        const map = {}
        for (const row of data ?? []) {
          map[row.event_id] = {
            subtasks: row.subtasks || [],
            done: Boolean(row.done),
            hidden: Boolean(row.hidden),
            title: row.title ?? null,
            date: row.date ?? null,
            time: row.time ?? null,
          }
        }
        if (!cancelled) setNotes(map)
      } catch (e) {
        console.error('Load event notes failed:', e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Same staleness problem as tasks: notes loaded once at startup, so a checklist
  // ticked off on the phone never appeared on the desktop until a full reload.
  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured) return
    try {
      const { data, error } = await supabase
        .from('event_notes')
        .select('event_id, subtasks, done, hidden, title, date, time')
      if (error) throw error
      const map = {}
      for (const row of data ?? []) {
        map[row.event_id] = {
          subtasks: row.subtasks || [],
          done: Boolean(row.done),
          hidden: Boolean(row.hidden),
          title: row.title ?? null,
          date: row.date ?? null,
          time: row.time ?? null,
        }
      }
      setNotes(map)
    } catch (e) {
      console.error('Event notes refresh failed:', e)
    }
  }, [])

  const get = (eventId) => notesRef.current[eventId] || EMPTY

  // `event` carries the block's context so the note can stand on its own later.
  const persist = useCallback(async (event, next) => {
    const record = {
      ...next,
      title: event.title ?? next.title ?? null,
      date: event.date ?? next.date ?? null,
      time: event.time ?? next.time ?? null,
    }
    setNotes(prev => ({ ...prev, [event.id]: record }))
    if (!isSupabaseConfigured || !userIdRef.current) return

    const { error } = await supabase.from('event_notes').upsert(
      {
        user_id: userIdRef.current,
        event_id: event.id,
        subtasks: record.subtasks,
        done: record.done,
        hidden: Boolean(record.hidden),
        title: record.title,
        date: record.date,
        time: record.time,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,event_id' },
    )
    if (error) console.error('Save event notes failed:', error)
  }, [])

  const addSubtask = useCallback((event, title) => {
    const clean = title.trim()
    if (!clean) return
    const cur = get(event.id)
    persist(event, { ...cur, subtasks: [...cur.subtasks, { id: uid(), title: clean, done: false }] })
  }, [persist])

  const toggleSubtask = useCallback((event, subId) => {
    const cur = get(event.id)
    persist(event, {
      ...cur,
      subtasks: cur.subtasks.map(s => (s.id === subId ? { ...s, done: !s.done } : s)),
    })
  }, [persist])

  // Soft, exactly like a task's subtasks: stamp deletedAt in place so the subtask
  // is hidden but restorable from "Deleted today" instead of gone for good.
  const removeSubtask = useCallback((event, subId) => {
    const cur = get(event.id)
    const deletedAt = new Date().toISOString()
    persist(event, {
      ...cur,
      subtasks: cur.subtasks.map(s => (s.id === subId ? { ...s, deletedAt } : s)),
    })
  }, [persist])

  const restoreSubtask = useCallback((eventId, subId) => {
    const cur = get(eventId)
    // The note stores its own title/date/time, so it can be rewritten without the
    // original event object in hand.
    persist({ id: eventId, title: cur.title, date: cur.date, time: cur.time }, {
      ...cur,
      subtasks: cur.subtasks.map(s => {
        if (s.id !== subId) return s
        const { deletedAt: _gone, ...live } = s
        return live
      }),
    })
  }, [persist])

  // Replace the whole subtasks array — used for reordering (drag) and renaming.
  // Callers only see live subtasks, so re-attach any hidden deleted ones or this
  // would quietly drop them.
  const setSubtasks = useCallback((event, subtasks) => {
    const cur = get(event.id)
    const incoming = new Set(subtasks.map(s => s.id))
    const hidden = (cur.subtasks || []).filter(s => s.deletedAt && !incoming.has(s.id))
    persist(event, { ...cur, subtasks: [...subtasks, ...hidden] })
  }, [persist])

  // "I'm wrapped up with this block" — Day Ahead-side only.
  const toggleDone = useCallback((event) => {
    const cur = get(event.id)
    persist(event, { ...cur, done: !cur.done })
  }, [persist])

  // "I don't need to see this on my schedule." A Day Ahead-side flag only — the
  // event is untouched in Google Calendar, it just stops taking up room here.
  const toggleHidden = useCallback((event) => {
    const cur = get(event.id)
    persist(event, { ...cur, hidden: !cur.hidden })
  }, [persist])

  // The stable part of an event id — everything after the account prefix
  // ("<calendar>:<googleEventId>"). Two ids for the same real event share this
  // even if their account prefix differs (old internal-id vs new email format).
  const suffixOf = (id) => String(id).split(':').slice(1).join(':')

  /* Two jobs on load:
     1. Recover subtasks orphaned by an account reconnect. The event id used to
        start with the account's internal id, which changes on reconnect; it now
        starts with the account email. An old note and the current event share
        the same suffix, so adopt the orphan's content onto the current id. The
        orphan is left in place (harmless, still searchable) — nothing is deleted.
     2. Fill missing title/date on older notes so they stay searchable. */
  const backfillContext = useCallback((events) => {
    const map = notesRef.current
    for (const e of events) {
      const cur = map[e.id]
      const curHasContent = cur && (cur.subtasks?.length > 0 || cur.done)

      if (!curHasContent) {
        const suffix = suffixOf(e.id)
        const orphan = Object.entries(map).find(([oid, n]) =>
          oid !== e.id && suffixOf(oid) === suffix && (n.subtasks?.length > 0 || n.done)
        )
        if (orphan) {
          persist({ id: e.id, title: e.title, date: e.date, time: e.time }, orphan[1])
          continue
        }
      }

      if (curHasContent && (!cur.title || !cur.date)) {
        persist({ id: e.id, title: e.title, date: e.date, time: e.time }, cur)
      }
    }
  }, [persist])

  // Consumers see only live subtasks; the soft-deleted ones come back separately
  // so they can be listed (and restored) alongside deleted tasks.
  const visibleNotes = useMemo(() => {
    const out = {}
    for (const [id, n] of Object.entries(notes)) {
      out[id] = (n.subtasks || []).some(s => s.deletedAt)
        ? { ...n, subtasks: n.subtasks.filter(s => !s.deletedAt) }
        : n
    }
    return out
  }, [notes])

  const deletedSubtasks = useMemo(() => {
    const out = []
    for (const [id, n] of Object.entries(notes)) {
      for (const s of n.subtasks || []) {
        if (s.deletedAt) out.push({ key: `${id}:${s.id}`, eventId: id, parentTitle: n.title, sub: s })
      }
    }
    return out
  }, [notes])

  return {
    notes: visibleNotes, loading, refresh, addSubtask, toggleSubtask, removeSubtask, toggleHidden,
    restoreSubtask, deletedSubtasks, setSubtasks, toggleDone, backfillContext,
  }
}
