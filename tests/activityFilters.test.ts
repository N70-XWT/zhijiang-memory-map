import test from 'node:test'
import assert from 'node:assert/strict'
import {
  emptyFilters,
  hasActiveFilters,
  matchesActivity,
  readFilters,
  toggleFilterValue,
  writeFilters,
  type FilterOptions,
} from '../src/lib/activityFilters.ts'
import type { Activity } from '../src/types/activity.ts'

const options: FilterOptions = {
  city: ['北京', '上海'],
  year: ['2025', '2026'],
  type: ['见面会', '演唱会'],
  member: ['乃琳', '嘉然', '贝拉'],
}
const activity = (members: string[], city = '北京', year = 2025, eventType = '见面会'): Activity =>
  ({ title: '回忆', city, year, eventType, venue: '剧场', members }) as Activity

test('every group toggles independently and keeps option order', () => {
  const one = toggleFilterValue([], '贝拉', options.member)
  assert.deepEqual(one, ['贝拉'])
  const two = toggleFilterValue(one, '乃琳', options.member)
  assert.deepEqual(two, ['乃琳', '贝拉'])
  assert.deepEqual(toggleFilterValue(two, '贝拉', options.member), ['乃琳'])
  assert.deepEqual(toggleFilterValue(['乃琳'], '乃琳', options.member), [])
  assert.deepEqual(toggleFilterValue(['2026'], '2025', options.year), ['2025', '2026'])
  assert.deepEqual(toggleFilterValue(['北京'], '上海', options.city), ['北京', '上海'])
  assert.deepEqual(toggleFilterValue(['见面会'], '演唱会', options.type), ['见面会', '演唱会'])
})

test('union within each group and intersection across groups and search', () => {
  const filters = { ...emptyFilters, member: ['乃琳', '贝拉'], city: ['北京', '上海'], year: ['2025', '2026'], type: ['见面会'], q: '剧场' }
  assert.equal(matchesActivity(activity(['乃琳']), filters), true)
  assert.equal(matchesActivity(activity(['贝拉'], '上海', 2026), filters), true)
  assert.equal(matchesActivity(activity(['嘉然']), filters), false)
  assert.equal(matchesActivity(activity(['乃琳'], '成都'), filters), false)
  assert.equal(matchesActivity(activity(['乃琳'], '上海', 2024), filters), false)
  assert.equal(matchesActivity(activity(['乃琳'], '上海', 2026, '演唱会'), filters), false)
  assert.equal(matchesActivity({ ...activity(['乃琳']), venue: '体育馆' }, filters), false)
  assert.equal(matchesActivity(activity(['嘉然']), emptyFilters), true)
  assert.equal(hasActiveFilters(filters), true)
  assert.equal(hasActiveFilters(emptyFilters), false)
})

test('repeated URLs round-trip, deduplicate and support old single-value links', () => {
  const url = new URLSearchParams('member=贝拉&member=乃琳&member=贝拉&member=unknown&city=北京&city=上海&city=unknown&year=2025&year=2026&type=见面会&type=演唱会&activity=keep')
  const filters = readFilters(url, options)
  assert.deepEqual(filters.member, ['乃琳', '贝拉'])
  assert.deepEqual(filters.city, ['北京', '上海'])
  assert.deepEqual(filters.year, ['2025', '2026'])
  assert.deepEqual(filters.type, ['见面会', '演唱会'])
  writeFilters(url, filters)
  assert.deepEqual(url.getAll('member'), ['乃琳', '贝拉'])
  assert.deepEqual(url.getAll('city'), ['北京', '上海'])
  assert.deepEqual(url.getAll('year'), ['2025', '2026'])
  assert.deepEqual(url.getAll('type'), ['见面会', '演唱会'])
  assert.equal(url.get('activity'), 'keep')
  assert.deepEqual(readFilters(new URLSearchParams('city=北京&year=2025&type=见面会&member=贝拉'), options), {
    city: ['北京'], year: ['2025'], type: ['见面会'], member: ['贝拉'], q: '',
  })
  writeFilters(url, emptyFilters)
  for (const key of ['member', 'city', 'year', 'type']) assert.equal(url.has(key), false)
  assert.equal(url.get('activity'), 'keep')
})
