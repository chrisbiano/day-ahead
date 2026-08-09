import { useState } from 'react'

/* Unfinished subtasks from earlier days, surfaced at the top of today.
 *
 * All three actions clear the step off the day it was planned, so a finished
 * day lists what actually got done. Done and Move both bring it to today (Done
 * arrives ticked, since today is when the work happened); x just clears it.
 * Clearing is a soft delete, so anything here is restorable from
 * "Recently deleted".
 *
 * Buttons are labelled with words, not just icons: the hide control taught us
 * that an icon doing double duty reads as a status rather than an action.
 */

const COLLAPSED = 5

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
      strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

export default function CarryOver({
  items = [],
  targetLabelFor,
  onComplete,
  onMove,
  onMoveAll,
  onDismiss,
}) {
  const [expanded, setExpanded] = useState(false)
  if (items.length === 0) return null

  const shown = expanded ? items : items.slice(0, COLLAPSED)
  const rest = items.length - shown.length

  return (
    <div className="card p-0 overflow-hidden mb-4">
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-line">
        <div className="min-w-0">
          <p className="text-[10px] font-medium text-faint uppercase tracking-wider">
            Unfinished
          </p>
          <p className="text-xs text-muted mt-0.5">
            {items.length} step{items.length === 1 ? '' : 's'} carried over from earlier
          </p>
        </div>
        {items.length > 1 && (
          <button
            onClick={onMoveAll}
            className="text-xs text-accent hover:underline shrink-0"
          >
            Move all here
          </button>
        )}
      </div>

      <ul className="divide-y divide-line">
        {shown.map(item => (
          <li key={item.key} className="flex items-center gap-3 px-5 py-2.5">
            {/* Same affordance as any other checkbox in the app. Completing
                lands the step on today, ticked — it's today's accomplishment. */}
            <button
              onClick={() => onComplete(item)}
              aria-label={`Mark "${item.title}" done today`}
              title="Done — records it on today"
              className="w-4 h-4 rounded-full border border-line2 text-transparent hover:text-accent hover:border-accent flex items-center justify-center transition-colors shrink-0"
            >
              <CheckIcon />
            </button>

            <span className="min-w-0 flex-1">
              <span className="block text-sm text-fg truncate">{item.title}</span>
              <span className="block text-[11px] text-faint truncate">
                {item.parentTitle} · {item.ago}
              </span>
            </span>

            <button
              onClick={() => onMove(item)}
              title={targetLabelFor(item)}
              className="text-xs text-accent hover:underline shrink-0"
            >
              Move
            </button>
            <button
              onClick={() => onDismiss(item)}
              aria-label={`Drop "${item.title}"`}
              title="Didn't happen — clear it (restorable from Recently deleted)"
              className="w-5 h-5 flex items-center justify-center rounded text-faint hover:text-fg hover:bg-surface2 transition-colors shrink-0"
            >
              ×
            </button>
          </li>
        ))}
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
