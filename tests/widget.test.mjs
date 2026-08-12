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

console.log(`\n  ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
