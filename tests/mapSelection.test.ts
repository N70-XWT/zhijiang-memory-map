import test from 'node:test'
import assert from 'node:assert/strict'
import {
  selectionReducer,
  TimelineScrollGate,
  type SelectionState,
} from '../src/lib/mapSelection.ts'
const initial: SelectionState = {
  activityId: null,
  panel: 'closed',
  source: 'url',
  revision: 0,
  returnToList: false,
}
test('scroll selects without opening a closed panel; updates an open detail', () => {
  let s = selectionReducer(initial, {
    type: 'select',
    id: 'a',
    source: 'scroll',
  })
  assert.equal(s.panel, 'closed')
  s = selectionReducer(s, { type: 'select', id: 'b', source: 'marker' })
  s = selectionReducer(s, { type: 'select', id: 'c', source: 'scroll' })
  assert.equal(s.activityId, 'c')
  assert.equal(s.panel, 'detail')
})
test('close preserves selection; reset clears; filtered selection never jumps to another event', () => {
  const s = selectionReducer(initial, {
    type: 'select',
    id: 'a',
    source: 'list',
  })
  assert.equal(selectionReducer(s, { type: 'close' }).activityId, 'a')
  assert.equal(
    selectionReducer(s, { type: 'filter', validIds: ['b'] }).activityId,
    null,
  )
  assert.equal(
    selectionReducer(s, { type: 'filter', validIds: [] }).panel,
    'closed',
  )
  assert.equal(selectionReducer(s, { type: 'reset' }).activityId, null)
  assert.equal(selectionReducer(s, { type: 'list' }).panel, 'list')
})
test('URL restore opens selected event and discards a previous selection', () => {
  assert.equal(
    selectionReducer(initial, { type: 'restore', id: 'a' }).panel,
    'detail',
  )
  assert.equal(
    selectionReducer(initial, { type: 'restore', id: null }).activityId,
    null,
  )
})
test('layout/auto scroll never selects and newer operations cancel stale callbacks', () => {
  const gate = new TimelineScrollGate()
  assert.equal(gate.consume(gate.ticket()), false)
  const stale = gate.beginUser()
  gate.beginProgrammatic()
  assert.equal(gate.consume(stale), false)
  const old = gate.beginUser()
  const latest = gate.beginUser()
  assert.equal(gate.consume(old), false)
  assert.equal(gate.consume(latest), true)
  assert.equal(gate.consume(latest), false)
})
