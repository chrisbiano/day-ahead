/* Widget snapshot tests.  Run: node tests/widget.test.mjs
   The snapshot is what a separate process draws with no ability to re-fetch, so
   getting the ordering and filtering right here is the only chance. */
import { buildSnapshot } from '../src/lib/widgetSnapshot.js'

const TODAY = '2026-08-12'
let pass = 0, fail = 0
const ok = (n, c) => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}`) }

const snap = buildSnapshot({
  todayISO: TODAY,
  tasks: [
    { title: 'Client Work', date: TODAY, time: '1:00 PM', subtasks: [{done:true},{done:false}] },
    { title: 'Morning run', date: TODAY, time: '8:00 AM', subtasks: [] },
    { title: 'Whenever', date: TODAY, time: null, subtasks: [] },
    { title: 'Already done', date: TODAY, time: '9:00 AM', completed: true, subtasks: [] },
    { title: 'Tomorrow', date: '2026-08-13', time: '9:00 AM', subtasks: [] },
    { title: 'Deleted', date: TODAY, time: '7:00 AM', deletedAt: 'x', subtasks: [] },
  ],
  events: [
    { title: 'Lost Saints', date: TODAY, time: '10:30 AM' },
    { title: 'Birthday', date: TODAY, allDay: true },
    { title: 'Yesterday thing', date: '2026-08-11', time: '9:00 AM' },
  ],
})

const titles = snap.items.map(i => i.title)
ok('chronological, untimed last', JSON.stringify(titles) ===
   JSON.stringify(['Morning run', 'Lost Saints', 'Client Work', 'Whenever']))
ok('completed excluded', !titles.includes('Already done'))
ok('deleted excluded', !titles.includes('Deleted'))
ok('other days excluded', !titles.includes('Tomorrow') && !titles.includes('Yesterday thing'))
ok('all-day events excluded', !titles.includes('Birthday'))
ok('PM sorts after AM', titles.indexOf('Client Work') > titles.indexOf('Morning run'))
ok('subtask counts carried', snap.items[2].subtaskTotal === 2 && snap.items[2].subtaskDone === 1)
ok('events marked as events', snap.items[1].kind === 'event')
ok('date stamped', snap.date === TODAY)

// A widget has room for a few rows; the count must still tell the truth.
const big = buildSnapshot({ todayISO: TODAY,
  tasks: Array.from({ length: 12 }, (_, i) => ({ title: `T${i}`, date: TODAY, time: `${i+1}:00 AM`, subtasks: [] })) })
ok('caps the rows it sends', big.items.length === 6)
ok('but reports the real total', big.total === 12)

ok('empty day is safe', buildSnapshot({ todayISO: TODAY }).items.length === 0)



// --- the fuller picture the medium widget draws -------------------------
{
  const s = buildSnapshot({
    todayISO: TODAY,
    tasks: [
      { title: 'Client Work', date: TODAY, time: '1:00 PM', subtasks: [] },
      { title: 'Call the venue', date: TODAY, time: null, subtasks: [] },
      // Undated is how the app actually stores an "anytime" task.
      { title: 'Invoice Calvin', date: null, time: null, subtasks: [] },
    ],
    events: [{ title: 'Lost Saints', date: TODAY, time: '10:30 AM' }],
    emails: [
      { action: 'reply' }, { action: 'reply' },
      { action: 'read' }, { action: 'unsubscribe' }, { action: null },
    ],
  })
  ok('untimed tasks marked as anytime', s.items.filter(i => i.kind === 'anytime').length === 2)
  ok('timed items keep their kind', s.items.filter(i => i.kind === 'anytime').length + s.timedTotal === s.total)
  ok('timed/anytime totals correct', s.timedTotal === 2 && s.anytimeTotal === 2)
  ok('needsReply counts only action=reply', s.needsReply === 2)
  ok('anytime sorts after timed', s.items[0].kind !== 'anytime' && s.items.at(-1).kind === 'anytime')

  // Undated tasks belong to today; a completed one still doesn't show.
  const un = buildSnapshot({ todayISO: TODAY, tasks: [
    { title: 'Loose end', date: null, time: null, subtasks: [] },
    { title: 'Done loose end', date: null, time: null, completed: true, subtasks: [] },
  ] })
  ok('undated task included as anytime', un.items.length === 1 && un.items[0].kind === 'anytime')
  ok('completed undated task excluded', !un.items.some(i => i.title === 'Done loose end'))

  const none = buildSnapshot({ todayISO: TODAY, tasks: [], events: [], emails: [] })
  ok('empty day reports zero replies', none.needsReply === 0 && none.total === 0)
}

console.log(`\n  ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
