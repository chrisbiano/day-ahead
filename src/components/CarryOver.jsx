import { useState } from 'react'

/* Carryover — steps still owed from days that have passed.
 *
 * Each one has already been cleared off its original day, so a finished day
 * lists what actually got done. They wait here until they're filed against
 * something on today or dropped; there's no deadline and nothing ages out, so
 * an item can sit unfiled without escaping the way the first design let it.
 *
 * Filing is a single picker rather than a one-click move plus a fallback. One
 * control means one meaning at a glance — the lesson from the hide toggle,
 * where an icon doing double duty read as a status instead of an action. The
 * suggested destination is pre-selected, so the common case is still one tap.
 */

const COLLAPSED = 5

function ChevronIcon({ open }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round"
      className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

export default function CarryOver({
  items = [],
  targets = [],
  destinationFor,
  onFile,
  onDrop,
}) {
  const [expanded, setExpanded] = useState(false)
  // Titles are truncated to keep rows scannable, but a long one is unreadable
  // on a phone — tapping it wraps the full text.
  const [openTitles, setOpenTitles] = useState(() => new Set())
  // Key of the row whose destination list is open. One at a time — this is the
  // exception, not the main path, and two open lists would crowd the card.
  const [pickerFor, setPickerFor] = useState(null)
  const toggleTitle = (key) => setOpenTitles(prev => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })
  if (items.length === 0) return null

  const shown = expanded ? items : items.slice(0, COLLAPSED)
  const rest = items.length - shown.length

  return (
    <div className="card p-0 overflow-hidden mb-4">
      <div className="px-5 py-3 border-b border-line">
        <p className="text-[10px] font-medium text-faint uppercase tracking-wider">
          Carryover
        </p>
        <p className="text-xs text-muted mt-0.5">
          {items.length} step{items.length === 1 ? '' : 's'} still open from earlier
        </p>
      </div>

      <ul className="divide-y divide-line">
        {shown.map(item => {
          const dest = destinationFor?.(item) ?? null
          const titleOpen = openTitles.has(item.key)
          return (
              /* Stacked on a phone, one row from sm up. Crowding a select and a
                 button onto the same line as the text left nothing to give at
                 narrow widths, and the select rode over its neighbour. */
              <li key={item.key} className="px-5 py-2.5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <button
                  onClick={() => toggleTitle(item.key)}
                  aria-expanded={titleOpen}
                  title={titleOpen ? 'Collapse' : 'Show the full title'}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className={`block text-sm text-fg ${titleOpen ? 'break-words' : 'truncate'}`}>
                    {item.title}
                  </span>
                  {/* Only flag the surprising case: with nothing on today to
                      attach to, the button makes it a task in its own right. */}
                  <span className="block text-[11px] text-faint truncate">
                    {item.parentTitle}{item.ago ? ` · ${item.ago}` : ''}
                    {dest ? '' : ' · adds as its own task'}
                  </span>
                </button>

                <span className="flex items-center gap-2 shrink-0">
                  {/* A plain button, not a picker. The previous version was a
                      select pre-set to the suggested destination, which made the
                      main action a dead control: re-choosing the option already
                      selected fires no change event, so the one destination you
                      usually want was the one you couldn't pick. */}
                  <button
                    onClick={() => onFile(item, dest?.key ?? null)}
                    title={dest
                      ? `Add "${item.title}" to ${dest.label} today`
                      : `Add "${item.title}" to today as its own task`}
                    className="px-3 py-1.5 text-xs rounded-lg bg-accent text-accent-fg font-medium hover:opacity-90 transition-opacity whitespace-nowrap flex-1 sm:flex-none"
                  >
                    Add to today
                  </button>

                  {/* Somewhere other than the obvious place. Hidden when today
                      has nothing to attach to, since an empty list is worse
                      than no control. */}
                  {targets.length > 0 && (
                    <button
                      onClick={() => setPickerFor(pickerFor === item.key ? null : item.key)}
                      aria-expanded={pickerFor === item.key}
                      aria-label={`Add "${item.title}" to a different task`}
                      title="Add to a different task"
                      className="w-6 h-6 flex items-center justify-center rounded text-faint hover:text-fg hover:bg-surface2 transition-colors shrink-0"
                    >
                      <ChevronIcon open={pickerFor === item.key} />
                    </button>
                  )}

                  <button
                    onClick={() => onDrop(item)}
                    aria-label={`Drop "${item.title}"`}
                    title="Not happening — drop it (restorable from Recently deleted)"
                    className="w-6 h-6 flex items-center justify-center rounded text-faint hover:text-fg hover:bg-surface2 transition-colors shrink-0"
                  >
                    ×
                  </button>
                </span>
                </div>

                {pickerFor === item.key && (
                  <div className="mt-2 pl-0 sm:pl-3 border-l-0 sm:border-l border-line2">
                    <p className="text-[10px] font-medium text-faint uppercase tracking-wider mb-1.5">
                      Add to
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {targets.map(t => (
                        <button
                          key={t.key}
                          onClick={() => { onFile(item, t.key); setPickerFor(null) }}
                          className={`px-2.5 py-1 text-xs rounded-lg border transition-colors max-w-full truncate ${
                            t.key === dest?.key
                              ? 'border-accent text-accent'
                              : 'border-line2 text-muted hover:text-fg hover:bg-surface2'
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </li>
          )
        })}
      </ul>

      {(rest > 0 || expanded) && (
        <button
          onClick={() => setExpanded(v => !v)}
          className="w-full text-left px-5 py-2.5 text-xs text-faint hover:text-fg border-t border-line transition-colors"
        >
          {rest > 0 ? `+${rest} older` : 'Show fewer'}
        </button>
      )}
    </div>
  )
}
