import type { Activity } from '@/types/activity'

export type MarkerOffset = {
  x: number
  y: number
}

export type ActivityMarkerLayout = {
  activity: Activity
  offset: MarkerOffset
  groupSize: number
  groupIndex: number
  maxOffsetPx: number
}

const COORDINATE_PRECISION = 6
const MIN_MARKER_CENTER_SPACING = 68
const MAX_MARKERS_PER_RING = 8

const coordinateKey = (activity: Activity): string =>
  `${activity.latitude.toFixed(COORDINATE_PRECISION)},${activity.longitude.toFixed(COORDINATE_PRECISION)}`

const compareActivitiesByLayoutOrder = (a: Activity, b: Activity): number =>
  b.date.localeCompare(a.date) || a.id.localeCompare(b.id)

const getRingCapacity = (ringIndex: number): number => MAX_MARKERS_PER_RING * (ringIndex + 1)

const getRingRadius = (ringCount: number, previousRingRadius: number): number => {
  const spacingRadius =
    ringCount <= 1
      ? 0
      : MIN_MARKER_CENTER_SPACING / (2 * Math.sin(Math.PI / ringCount))

  if (previousRingRadius <= 0) {
    return Math.max(spacingRadius, MIN_MARKER_CENTER_SPACING / 2)
  }

  return Math.max(spacingRadius, previousRingRadius + MIN_MARKER_CENTER_SPACING)
}

const roundOffset = (value: number): number => Math.round(value * 100) / 100

const buildGroupOffsets = (groupSize: number): MarkerOffset[] => {
  if (groupSize <= 1) {
    return [{ x: 0, y: 0 }]
  }

  const offsets: MarkerOffset[] = []
  let remaining = groupSize
  let ringIndex = 0
  let previousRingRadius = 0

  while (remaining > 0) {
    const ringCount = Math.min(remaining, getRingCapacity(ringIndex))
    const radius = getRingRadius(ringCount, previousRingRadius)
    const angleOffset = ringCount === 2 ? 0 : -Math.PI / 2

    for (let index = 0; index < ringCount; index += 1) {
      const angle = angleOffset + (index / ringCount) * Math.PI * 2
      offsets.push({
        x: roundOffset(Math.cos(angle) * radius),
        y: roundOffset(Math.sin(angle) * radius),
      })
    }

    remaining -= ringCount
    ringIndex += 1
    previousRingRadius = radius
  }

  return offsets
}

export const layoutActivityMarkers = (activities: Activity[]): ActivityMarkerLayout[] => {
  const groups = new Map<string, Activity[]>()

  activities.forEach((activity) => {
    const key = coordinateKey(activity)
    const group = groups.get(key)

    if (group) {
      group.push(activity)
      return
    }

    groups.set(key, [activity])
  })

  const layoutsByActivityId = new Map<string, ActivityMarkerLayout>()

  groups.forEach((group) => {
    const orderedGroup = [...group].sort(compareActivitiesByLayoutOrder)
    const offsets = buildGroupOffsets(orderedGroup.length)
    const maxOffsetPx = offsets.reduce(
      (maximum, offset) => Math.max(maximum, Math.abs(offset.x), Math.abs(offset.y)),
      0
    )

    orderedGroup.forEach((activity, groupIndex) => {
      layoutsByActivityId.set(activity.id, {
        activity,
        offset: offsets[groupIndex],
        groupSize: orderedGroup.length,
        groupIndex,
        maxOffsetPx,
      })
    })
  })

  return activities.map((activity) => {
    const layout = layoutsByActivityId.get(activity.id)
    if (!layout) {
      return {
        activity,
        offset: { x: 0, y: 0 },
        groupSize: 1,
        groupIndex: 0,
        maxOffsetPx: 0,
      }
    }

    return layout
  })
}
