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

export type MarkerScreenPoint = MarkerOffset

export type ViewportActivityMarker = {
  activity: Activity
  position: MarkerScreenPoint
  groupIndex: number
  groupSize: number
}

export type ViewportMarkerGroup = {
  key: string
  activities: Activity[]
  center: MarkerScreenPoint
  isExpanded: boolean
  markers: ViewportActivityMarker[]
  maxOffsetPx: number
}

export type ViewportMarkerLayoutOptions = {
  zoom: number
  expandAtZoom?: number
  selectedActivityId?: string | null
  collisionDistancePx?: number
}

const COORDINATE_PRECISION = 6
const MIN_MARKER_CENTER_SPACING = 69
const MAX_MARKERS_PER_RING = 8

export const MARKER_COLLISION_DISTANCE_PX = 72
export const MARKER_EXPANSION_MIN_ZOOM = 12

const coordinateKey = (activity: Activity): string =>
  `${activity.latitude.toFixed(COORDINATE_PRECISION)},${activity.longitude.toFixed(COORDINATE_PRECISION)}`

export const compareActivitiesByLayoutOrder = (a: Activity, b: Activity): number =>
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

export const buildMarkerGroupOffsets = (groupSize: number): MarkerOffset[] => {
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

type ProjectedActivity = {
  activity: Activity
  point: MarkerScreenPoint
}

type WorkingMarkerGroup = {
  entries: ProjectedActivity[]
}

const getGroupCenter = (entries: ProjectedActivity[]): MarkerScreenPoint => {
  const total = entries.reduce(
    (position, entry) => ({
      x: position.x + entry.point.x,
      y: position.y + entry.point.y,
    }),
    { x: 0, y: 0 }
  )

  return {
    x: total.x / entries.length,
    y: total.y / entries.length,
  }
}

const getDistance = (a: MarkerScreenPoint, b: MarkerScreenPoint): number =>
  Math.hypot(a.x - b.x, a.y - b.y)

const getGroupLayout = (
  group: WorkingMarkerGroup,
  shouldExpand: boolean
): ViewportMarkerGroup => {
  const entries = [...group.entries].sort((a, b) =>
    compareActivitiesByLayoutOrder(a.activity, b.activity)
  )
  const activities = entries.map(({ activity }) => activity)
  const center = getGroupCenter(entries)
  const isExpanded = activities.length > 1 && shouldExpand
  const offsets = isExpanded
    ? buildMarkerGroupOffsets(activities.length)
    : [{ x: 0, y: 0 }]
  const markers = isExpanded
    ? entries.map(({ activity }, groupIndex) => ({
        activity,
        position: {
          x: center.x + offsets[groupIndex].x,
          y: center.y + offsets[groupIndex].y,
        },
        groupIndex,
        groupSize: activities.length,
      }))
    : activities.length === 1
      ? [
          {
            activity: activities[0],
            position: entries[0].point,
            groupIndex: 0,
            groupSize: 1,
          },
        ]
      : []

  return {
    key: activities.map(({ id }) => id).join('|'),
    activities,
    center,
    isExpanded,
    markers,
    maxOffsetPx: offsets.reduce(
      (maximum, offset) => Math.max(maximum, Math.abs(offset.x), Math.abs(offset.y)),
      0
    ),
  }
}

const groupsCollide = (
  first: ViewportMarkerGroup,
  second: ViewportMarkerGroup,
  collisionDistancePx: number
): boolean => {
  const firstPositions = first.markers.length > 0 ? first.markers : [{ position: first.center }]
  const secondPositions = second.markers.length > 0 ? second.markers : [{ position: second.center }]

  return firstPositions.some((firstMarker) =>
    secondPositions.some(
      (secondMarker) =>
        getDistance(firstMarker.position, secondMarker.position) < collisionDistancePx
    )
  )
}

const projectedGroupsCollide = (
  first: WorkingMarkerGroup,
  second: WorkingMarkerGroup,
  collisionDistancePx: number
): boolean =>
  first.entries.some((firstEntry) =>
    second.entries.some(
      (secondEntry) =>
        getDistance(firstEntry.point, secondEntry.point) < collisionDistancePx
    )
  )

/**
 * Builds a deterministic screen-space layout. Groups are repeatedly merged until
 * every visible marker belonging to a different group has enough room. At low
 * zoom a group becomes one cluster; at high zoom (or when selected) it expands.
 */
export const layoutViewportMarkers = (
  activities: Activity[],
  project: (activity: Activity) => MarkerScreenPoint,
  {
    zoom,
    expandAtZoom = MARKER_EXPANSION_MIN_ZOOM,
    selectedActivityId = null,
    collisionDistancePx = MARKER_COLLISION_DISTANCE_PX,
  }: ViewportMarkerLayoutOptions
): ViewportMarkerGroup[] => {
  const orderedActivities = [...activities].sort(compareActivitiesByLayoutOrder)
  const groups: WorkingMarkerGroup[] = orderedActivities.map((activity) => ({
    entries: [{ activity, point: project(activity) }],
  }))

  const shouldExpand = (group: WorkingMarkerGroup): boolean =>
    zoom >= expandAtZoom ||
    group.entries.some(({ activity }) => activity.id === selectedActivityId)

  // First preserve the full connected component at the true venue positions.
  // Otherwise a ring can develop an empty center while it is being built and
  // incorrectly leave later activities at the same coordinate in another group.
  while (groups.length > 1) {
    let collision: [number, number] | null = null

    for (let firstIndex = 0; firstIndex < groups.length && !collision; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < groups.length; secondIndex += 1) {
        if (
          projectedGroupsCollide(
            groups[firstIndex],
            groups[secondIndex],
            collisionDistancePx
          )
        ) {
          collision = [firstIndex, secondIndex]
          break
        }
      }
    }

    if (!collision) {
      break
    }

    const [firstIndex, secondIndex] = collision
    groups[firstIndex] = {
      entries: [...groups[firstIndex].entries, ...groups[secondIndex].entries],
    }
    groups.splice(secondIndex, 1)
  }

  while (groups.length > 1) {
    const layouts = groups.map((group) => getGroupLayout(group, shouldExpand(group)))
    let collision: [number, number] | null = null

    for (let firstIndex = 0; firstIndex < layouts.length && !collision; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < layouts.length; secondIndex += 1) {
        if (groupsCollide(layouts[firstIndex], layouts[secondIndex], collisionDistancePx)) {
          collision = [firstIndex, secondIndex]
          break
        }
      }
    }

    if (!collision) {
      return layouts
    }

    const [firstIndex, secondIndex] = collision
    groups[firstIndex] = {
      entries: [...groups[firstIndex].entries, ...groups[secondIndex].entries],
    }
    groups.splice(secondIndex, 1)
  }

  return groups.map((group) => getGroupLayout(group, shouldExpand(group)))
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
    const offsets = buildMarkerGroupOffsets(orderedGroup.length)
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
