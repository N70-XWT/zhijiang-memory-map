import confirmedActivitiesData from '@/data/confirmedActivities.json'
import { mockActivities } from '@/data/mockActivities'
import type { Activity } from '@/types/activity'

const confirmedActivities = confirmedActivitiesData as Activity[]

const getActivitySource = (): Activity[] =>
  confirmedActivities.length > 0 ? confirmedActivities : mockActivities

export const getAllActivities = (): Activity[] => getActivitySource()

export const getActivityById = (id: string): Activity | undefined =>
  getActivitySource().find((activity) => activity.id === id)

export const getActivityBySlug = (slug: string): Activity | undefined =>
  getActivitySource().find((activity) => activity.slug === slug)

export const getRelatedActivities = (activity: Activity, limit = 3): Activity[] => {
  const hasSharedTag = (target: Activity) =>
    target.tags.some((tag) => activity.tags.includes(tag))

  const score = (target: Activity): number => {
    let value = 0
    if (target.city === activity.city) value += 3
    if (target.eventType === activity.eventType) value += 2
    if (target.members.some((member) => activity.members.includes(member))) value += 2
    if (hasSharedTag(target)) value += 1
    return value
  }

  return getActivitySource()
    .filter((target) => target.id !== activity.id)
    .sort((a, b) => score(b) - score(a) || b.year - a.year)
    .slice(0, limit)
}
