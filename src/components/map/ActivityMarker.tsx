'use client'

import { memo, useMemo } from 'react'
import type { LatLngTuple, LeafletEventHandlerFnMap } from 'leaflet'
import { Marker, Tooltip } from 'react-leaflet'
import { createActivityMarkerIcon } from '@/lib/map'
import type { MarkerOffset } from '@/lib/markerLayout'
import type { Activity } from '@/types/activity'

type ActivityMarkerProps = {
  activity: Activity
  offset: MarkerOffset
  isSelected: boolean
  onSelect: (activity: Activity) => void
}

function ActivityMarkerComponent({
  activity,
  offset,
  isSelected,
  onSelect,
}: ActivityMarkerProps) {
  const position = useMemo<LatLngTuple>(
    () => [activity.latitude, activity.longitude],
    [activity.latitude, activity.longitude]
  )

  const defaultIcon = useMemo(
    () =>
      createActivityMarkerIcon({
        thumbnail: activity.markerThumbnail,
        title: activity.title,
        isSelected: false,
        offset,
      }),
    [activity.markerThumbnail, activity.title, offset]
  )

  const selectedIcon = useMemo(
    () =>
      createActivityMarkerIcon({
        thumbnail: activity.markerThumbnail,
        title: activity.title,
        isSelected: true,
        offset,
      }),
    [activity.markerThumbnail, activity.title, offset]
  )

  const eventHandlers = useMemo<LeafletEventHandlerFnMap>(
    () => ({
      click: () => onSelect(activity),
    }),
    [onSelect, activity]
  )

  const tooltipTitle = useMemo(
    () => `${activity.date} ${activity.title}`,
    [activity.date, activity.title]
  )

  const tooltipOffset = useMemo<[number, number]>(
    () => [offset.x, offset.y - 28],
    [offset.x, offset.y]
  )

  return (
    <Marker
      position={position}
      icon={isSelected ? selectedIcon : defaultIcon}
      eventHandlers={eventHandlers}
    >
      <Tooltip
        direction="top"
        offset={tooltipOffset}
        opacity={1}
        className="activity-marker-tooltip"
      >
        {tooltipTitle}
      </Tooltip>
    </Marker>
  )
}

const ActivityMarker = memo(
  ActivityMarkerComponent,
  (prevProps, nextProps) =>
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.activity.id === nextProps.activity.id &&
    prevProps.offset.x === nextProps.offset.x &&
    prevProps.offset.y === nextProps.offset.y &&
    prevProps.onSelect === nextProps.onSelect
)

export default ActivityMarker
