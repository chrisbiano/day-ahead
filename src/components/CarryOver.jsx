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

export default function CarryOver({
  items = [],
  targets = [],
  suggestedKeyFor,
  onFile,
  onDrop,
}) {
  const [expanded, setExpanded] = useState(false)
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
          const suggested = suggestedKeyFor?.(item) ?? null
          return (
            <li key={item.key} className="flex items-center gap-3 px-5 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-fg truncate">{item.title}</span>
                <span className="block text-[11px] text-faint truncate">
                  {item.parentTitle}{item.ago ? ` · ${item.ago}` : ''}
                </span>
              </span>

              {/* Value stays on the suggestion so the select reads as a
                  destination, not an empty prompt. Choosing files immediately —
                  there's no separate confirm to forget. */}
              <select
                value={suggested ?? ''}
                onChange={e => { if (e.target.value) onFile(item, e.target.value) }}
                aria-label={`Add "${item.title}" to a task today`}
                className="input py-1 text-xs max-w-[9rem] shrink-0"
              >
                <option value="">Add to…</option>
                {targets.map(t => (
                  <option key={t.key} value={t.key}>{t.label}</option>
                ))}
              </select>

              <button
                onClick={() => onDrop(item)}
                aria-label={`Drop "${item.title}"`}
                title="Not happening — drop it (restorable from Recently deleted)"
                className="w-5 h-5 flex items-center justify-center rounded text-faint hover:text-fg hover:bg-surface2 transition-colors shrink-0"
              >
                ×
              </button>
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
