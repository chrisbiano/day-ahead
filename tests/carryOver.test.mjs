/* Pure-logic tests for the carry-over selector.  Run:  node tests/carryOver.test.mjs  */
import assert from 'node:assert/strict'
import {
  carryOverItems, findTodayTarget, shiftISO, agoLabel, isPending, CARRY_LOOKBACK_DAYS,
} from '../src/lib/carryOver.js'

const TODAY = '2026-08-08'
const YDAY = '2026-08-07'
let passed = 0
const t = (name, fn) => { fn(); passed++; console.log(`  ok  ${name}`) }

const sub = (id, title, extra = {}) => ({ id, title, done: false, ...extra })
const task = (o) => ({ id: 'x', title: 'T', date: YDAY, subtasks: [], ...o })

t('shiftISO crosses month and year boundaries', () => {
  assert.equal(shiftISO('2026-08-01', -1), '2026-07-31')
  assert.equal(shiftISO('2026-01-01', -1), '2025-12-31')
  assert.equal(shiftISO('2026-03-08', -1), '2026-03-07')  // US DST spring-forward
  assert.equal(shiftISO(TODAY, -CARRY_LOOKBACK_DAYS), '2026-08-01')
})

t('isPending ignores done, deleted and already-carried subtasks', () => {
  assert.equal(isPending(sub('1', 'a')), true)
  assert.equal(isPending(sub('1', 'a', { done: true })), false)
  assert.equal(isPending(sub('1', 'a', { deletedAt: '2026-08-07T10:00:00Z' })), false)
  assert.equal(isPending(sub('1', 'a', { carriedAt: '2026-08-08T09:00:00Z' })), false)
})

t('collects only unfinished subtasks from before today', () => {
  const tasks = [
    task({ id: 'a', title: 'LS Prep', subtasks: [sub('s1', 'Pull audio'), sub('s2', 'Done one', { done: true })] }),
    task({ id: 'b', title: 'Today', date: TODAY, subtasks: [sub('s3', 'Not a leftover')] }),
    task({ id: 'c', title: 'Future', date: '2026-08-09', subtasks: [sub('s4', 'Nope')] }),
  ]
  const got = carryOverItems({ tasks, todayISO: TODAY })
  assert.deepEqual(got.map(i => i.title), ['Pull audio'])
  assert.equal(got[0].parentTitle, 'LS Prep')
  assert.equal(got[0].ago, 'Yesterday')
})

t('respects the lookback window and skips deleted parents', () => {
  const old = shiftISO(TODAY, -CARRY_LOOKBACK_DAYS - 1)
  const edge = shiftISO(TODAY, -CARRY_LOOKBACK_DAYS)
  const tasks = [
    task({ id: 'old', date: old, subtasks: [sub('s1', 'Too old')] }),
    task({ id: 'edge', date: edge, subtasks: [sub('s2', 'Just inside')] }),
    task({ id: 'gone', date: YDAY, deletedAt: 'x', subtasks: [sub('s3', 'Parent deleted')] }),
  ]
  const got = carryOverItems({ tasks, todayISO: TODAY }).map(i => i.title)
  assert.deepEqual(got, ['Just inside'])
})

t('includes calendar-block notes and sorts newest day first', () => {
  const tasks = [task({ id: 'a', title: 'Zeta', date: shiftISO(TODAY, -3), subtasks: [sub('s1', 'Older') ] })]
  const eventNotes = {
    'acct:evt1': { date: YDAY, title: 'Client Work', subtasks: [sub('s2', 'Send cut')] },
    'acct:evt2': { date: YDAY, title: 'Admin', subtasks: [sub('s3', 'Invoice'), sub('s4', 'Filed', { done: true })] },
    'acct:evt3': { date: TODAY, title: 'Today block', subtasks: [sub('s5', 'Not yet')] },
  }
  const got = carryOverItems({ tasks, eventNotes, todayISO: TODAY })
  assert.deepEqual(got.map(i => i.title), ['Invoice', 'Send cut', 'Older'])
  assert.equal(got[0].source, 'event')
  assert.equal(got[0].parentId, 'acct:evt2')
  assert.equal(got.at(-1).source, 'task')
})

t('agoLabel says Yesterday at one day out, weekday beyond', () => {
  assert.equal(agoLabel(YDAY, TODAY), 'Yesterday')
  assert.equal(agoLabel('2026-08-04', TODAY), 'Tue')
})

t('findTodayTarget prefers the series row over a title match', () => {
  const item = { source: 'task', parentTitle: 'LS Prep', seriesId: 'ser-1' }
  const tasks = [
    { id: 'wrong', title: 'LS Prep', date: TODAY },
    { id: 'right', title: 'Renamed today', date: TODAY, seriesId: 'ser-1' },
  ]
  assert.equal(findTodayTarget(item, { tasks, todayISO: TODAY }).task.id, 'right')
})

t('findTodayTarget falls back to title, ignoring case and completed rows', () => {
  const item = { source: 'task', parentTitle: '  ls prep ', seriesId: null }
  const tasks = [
    { id: 'done', title: 'LS Prep', date: TODAY, completed: true },
    { id: 'live', title: 'LS Prep', date: TODAY },
  ]
  assert.equal(findTodayTarget(item, { tasks, todayISO: TODAY }).task.id, 'live')
})

t('findTodayTarget matches a calendar block by title, never an all-day one', () => {
  const item = { source: 'event', parentTitle: 'Client Work', seriesId: null }
  const events = [
    { id: 'e-allday', title: 'Client Work', allDay: true },
    { id: 'e-timed', title: 'Client Work' },
  ]
  const hit = findTodayTarget(item, { events, todayISO: TODAY })
  assert.equal(hit.kind, 'event')
  assert.equal(hit.event.id, 'e-timed')
})

t('findTodayTarget returns null when today has no home for it', () => {
  const item = { source: 'task', parentTitle: 'Vanished', seriesId: null }
  assert.equal(findTodayTarget(item, { tasks: [], events: [], todayISO: TODAY }), null)
})

t('empty and missing inputs are safe', () => {
  assert.deepEqual(carryOverItems(), [])
  assert.deepEqual(carryOverItems({ todayISO: TODAY }), [])
  assert.deepEqual(carryOverItems({ tasks: [task({ subtasks: null })], todayISO: TODAY }), [])
})

console.log(`\n${passed} passed`)
