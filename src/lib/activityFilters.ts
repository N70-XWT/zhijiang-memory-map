import type { Activity } from '../types/activity'

export type FilterKey = 'member' | 'city' | 'year' | 'type'
export type Filters = Record<FilterKey, string[]> & { q: string }
export type FilterOptions = Record<FilterKey, string[]>

export const emptyFilters: Filters = {
  member: [],
  city: [],
  year: [],
  type: [],
  q: '',
}

const filterKeys: FilterKey[] = ['member', 'city', 'year', 'type']

export function readFilters(params: URLSearchParams, options: FilterOptions): Filters {
  return {
    member: options.member.filter((member) => params.getAll('member').includes(member)),
    city: options.city.filter((value) => params.getAll('city').includes(value)),
    year: options.year.filter((value) => params.getAll('year').includes(value)),
    type: options.type.filter((value) => params.getAll('type').includes(value)),
    q: params.get('q') ?? '',
  }
}

export function writeFilters(params: URLSearchParams, filters: Filters): void {
  for (const key of filterKeys) {
    params.delete(key)
    for (const value of filters[key]) params.append(key, value)
  }
  if (filters.q.trim()) params.set('q', filters.q.trim())
  else params.delete('q')
}

export function toggleFilterValue(values: string[], value: string, options: string[]): string[] {
  const selected = new Set(values)
  if (selected.has(value)) selected.delete(value)
  else selected.add(value)
  return options.filter((option) => selected.has(option))
}

export function matchesActivity(activity: Activity, filters: Filters): boolean {
  return (
    (filters.member.length === 0 || filters.member.some((member) => activity.members.includes(member))) &&
    (filters.city.length === 0 || filters.city.includes(activity.city)) &&
    (filters.year.length === 0 || filters.year.includes(String(activity.year))) &&
    (filters.type.length === 0 || filters.type.includes(activity.eventType)) &&
    `${activity.title} ${activity.city} ${activity.venue}`
      .toLowerCase()
      .includes(filters.q.trim().toLowerCase())
  )
}

export function hasActiveFilters(filters: Filters): boolean {
  return filterKeys.some((key) => filters[key].length > 0) || Boolean(filters.q.trim())
}
