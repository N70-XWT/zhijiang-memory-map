'use client'

import { memo, useMemo } from 'react'
import type { LatLngTuple, LeafletEventHandlerFnMap } from 'leaflet'
import { Marker, Tooltip } from 'react-leaflet'
import { createActivityMarkerIcon } from '@/lib/map'
import type { Activity } from '@/types/activity'

type ActivityMarkerProps = {
  activity: Activity
  isSelected: boolean
  onSelect: (activity: Activity) => void
}

function ActivityMarkerComponent({
  activity,
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
      }),
    [activity.markerThumbnail, activity.title]
  )

  const selectedIcon = useMemo(
    () =>
      createActivityMarkerIcon({
        thumbnail: activity.markerThumbnail,
        title: activity.title,
        isSelected: true,
      }),
    [activity.markerThumbnail, activity.title]
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

  return (
    <Marker
      position={position}
      icon={isSelected ? selectedIcon : defaultIcon}
      eventHandlers={eventHandlers}
    >
      <Tooltip
        direction="top"
        offset={[0, -28]}
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
    prevProps.onSelect === nextProps.onSelect
)

export default ActivityMarker
