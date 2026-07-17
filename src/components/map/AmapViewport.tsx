'use client'

import AMapLoader from '@amap/amap-jsapi-loader'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AMAP_FOCUS_MIN_ZOOM,
  AMAP_INITIAL_FIT_MAX_ZOOM,
  AMAP_INITIAL_SINGLE_MARKER_ZOOM,
  AMAP_KEY,
  AMAP_MAP_CENTER,
  AMAP_MAP_MAX_ZOOM,
  AMAP_MAP_MIN_ZOOM,
  AMAP_MAP_ZOOM,
  configureAmapSecurity,
  isAmapConfigured,
  type AmapLngLat,
} from '@/lib/amap'
import { layoutActivityMarkers, type ActivityMarkerLayout } from '@/lib/markerLayout'
import type { Activity } from '@/types/activity'

type AmapViewportProps = {
  activities: Activity[]
  selectedActivity: Activity | null
  selectedActivityId: string | null
  fitAllRequest: number
  focusSelectedRequest: number
  onSelect: (activity: Activity) => void
}

type AMapNamespace = typeof globalThis & {
  Map: new (container: HTMLDivElement, options: Record<string, unknown>) => AMapMap
  Marker: new (options: Record<string, unknown>) => AMapMarker
  Pixel: new (x: number, y: number) => unknown
}

type AMapMap = {
  add: (target: AMapMarker | AMapMarker[]) => void
  destroy: () => void
  getZoom: () => number
  remove: (target: AMapMarker | AMapMarker[]) => void
  setCenter: (position: AmapLngLat) => void
  setFitView?: (
    overlays?: AMapMarker[],
    immediately?: boolean,
    avoid?: number[],
    maxZoom?: number
  ) => void
  setZoomAndCenter: (
    zoom: number,
    position: AmapLngLat,
    immediately?: boolean,
    duration?: number
  ) => void
}

type AMapMarker = {
  off: (eventName: string, callback?: () => void) => void
  on: (eventName: string, callback: () => void) => void
  setOffset: (offset: unknown) => void
  setPosition: (position: AmapLngLat) => void
  setzIndex: (zIndex: number) => void
}

type ActivityMarkerElements = {
  shell: HTMLDivElement
  marker: HTMLDivElement
  image: HTMLImageElement
  tooltip: HTMLDivElement
}

const FOCUS_ANIMATION_DURATION_MS = 480

const toAmapPosition = (activity: Activity): AmapLngLat => [
  activity.longitude,
  activity.latitude,
]

const getMarkerZIndex = (layout: ActivityMarkerLayout, isSelected: boolean): number =>
  isSelected ? 120 : 100 + layout.groupSize - layout.groupIndex

const fitActivities = (map: AMapMap, markers: AMapMarker[], layouts: ActivityMarkerLayout[]) => {
  if (markers.length === 0 || layouts.length === 0) {
    return
  }

  try {
    if (markers.length === 1) {
      map.setZoomAndCenter(
        AMAP_INITIAL_SINGLE_MARKER_ZOOM,
        toAmapPosition(layouts[0].activity),
        false,
        550
      )
    } else if (map.setFitView) {
      const offsetPadding = Math.ceil(
        layouts.reduce((maximum, layout) => Math.max(maximum, layout.maxOffsetPx), 0)
      )
      map.setFitView(
        markers,
        false,
        [260 + offsetPadding, 80 + offsetPadding, 120 + offsetPadding, 80 + offsetPadding],
        AMAP_INITIAL_FIT_MAX_ZOOM
      )
    } else {
      map.setZoomAndCenter(
        AMAP_INITIAL_FIT_MAX_ZOOM,
        toAmapPosition(layouts[0].activity),
        false,
        550
      )
    }
  } catch {
    map.setCenter(toAmapPosition(layouts[0].activity))
  }
}

const createMarkerContent = (
  activity: Activity,
  isSelected: boolean
): ActivityMarkerElements => {
  const shell = document.createElement('div')
  shell.className = 'amap-activity-marker-shell'

  const marker = document.createElement('div')
  marker.className = isSelected ? 'activity-marker selected' : 'activity-marker'
  marker.setAttribute('aria-label', activity.title)

  const image = document.createElement('img')
  image.src = activity.markerThumbnail
  image.alt = activity.title
  image.width = 56
  image.height = 56
  image.loading = 'lazy'
  image.decoding = 'async'
  image.fetchPriority = 'low'
  image.onerror = () => {
    image.style.display = 'none'
    marker.classList.add('is-fallback')
  }

  const tooltip = document.createElement('div')
  tooltip.className = 'activity-marker-tooltip amap-activity-marker-tooltip'
  tooltip.textContent = `${activity.date} ${activity.title}`

  marker.appendChild(image)
  shell.appendChild(marker)
  shell.appendChild(tooltip)

  return { shell, marker, image, tooltip }
}

const updateMarkerContent = (
  elements: ActivityMarkerElements,
  activity: Activity,
  isSelected: boolean
) => {
  elements.marker.classList.toggle('selected', isSelected)
  elements.marker.setAttribute('aria-label', activity.title)

  if (elements.image.getAttribute('src') !== activity.markerThumbnail) {
    elements.image.src = activity.markerThumbnail
  }
  elements.image.alt = activity.title
  elements.tooltip.textContent = `${activity.date} ${activity.title}`
}

function AmapViewportComponent({
  activities,
  selectedActivity,
  selectedActivityId,
  fitAllRequest,
  focusSelectedRequest,
  onSelect,
}: AmapViewportProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const amapRef = useRef<AMapNamespace | null>(null)
  const mapRef = useRef<AMapMap | null>(null)
  const markersByIdRef = useRef<Map<string, AMapMarker>>(new Map())
  const markerElementsByIdRef = useRef<Map<string, ActivityMarkerElements>>(new Map())
  const markerActivitiesByIdRef = useRef<Map<string, Activity>>(new Map())
  const markerClickHandlersByIdRef = useRef<Map<string, () => void>>(new Map())
  const hasFitInitialMarkersRef = useRef(false)
  const selectedActivityIdRef = useRef<string | null>(selectedActivityId)
  const focusFrameRef = useRef<number | null>(null)
  const onSelectRef = useRef(onSelect)
  const [isMapReady, setIsMapReady] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const markerLayouts = useMemo(() => layoutActivityMarkers(activities), [activities])
  const markerLayoutsById = useMemo(
    () => new Map(markerLayouts.map((layout) => [layout.activity.id, layout])),
    [markerLayouts]
  )

  const selectedPosition = useMemo(
    () => (selectedActivity ? toAmapPosition(selectedActivity) : null),
    [selectedActivity]
  )

  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])

  const getCurrentMarkers = useCallback(
    () =>
      markerLayouts
        .map((layout) => markersByIdRef.current.get(layout.activity.id))
        .filter((marker): marker is AMapMarker => Boolean(marker)),
    [markerLayouts]
  )

  const applyMarkerSelectedState = useCallback(
    (activityId: string, isSelected: boolean) => {
      const elements = markerElementsByIdRef.current.get(activityId)
      const marker = markersByIdRef.current.get(activityId)
      const layout = markerLayoutsById.get(activityId)

      if (elements) {
        elements.marker.classList.toggle('selected', isSelected)
      }

      if (marker && layout) {
        marker.setzIndex(getMarkerZIndex(layout, isSelected))
      }
    },
    [markerLayoutsById]
  )

  const focusPosition = useCallback(
    (position: AmapLngLat, targetZoom: number) => {
      if (!isMapReady) {
        return
      }

      if (focusFrameRef.current !== null) {
        window.cancelAnimationFrame(focusFrameRef.current)
      }

      focusFrameRef.current = window.requestAnimationFrame(() => {
        focusFrameRef.current = null

        const map = mapRef.current
        if (!map) {
          return
        }

        try {
          map.setZoomAndCenter(targetZoom, position, false, FOCUS_ANIMATION_DURATION_MS)
        } catch {
          map.setCenter(position)
        }
      })
    },
    [isMapReady]
  )

  useEffect(() => {
    let isDisposed = false

    const loadMap = async () => {
      if (!containerRef.current) {
        return
      }

      if (!isAmapConfigured()) {
        setLoadError('缺少高德地图 Key，请在 .env.local 中配置 NEXT_PUBLIC_AMAP_KEY。')
        return
      }

      try {
        configureAmapSecurity()
        const amap = (await AMapLoader.load({
          key: AMAP_KEY,
          version: '2.0',
          plugins: [],
        })) as AMapNamespace

        if (isDisposed || !containerRef.current) {
          return
        }

        amapRef.current = amap
        mapRef.current = new amap.Map(containerRef.current, {
          center: AMAP_MAP_CENTER,
          zoom: AMAP_MAP_ZOOM,
          zooms: [AMAP_MAP_MIN_ZOOM, AMAP_MAP_MAX_ZOOM],
          resizeEnable: true,
          viewMode: '2D',
        })
        setLoadError(null)
        setIsMapReady(true)
      } catch (error) {
        if (!isDisposed) {
          setLoadError(error instanceof Error ? error.message : '高德地图加载失败。')
        }
      }
    }

    loadMap()

    return () => {
      isDisposed = true
      if (focusFrameRef.current !== null) {
        window.cancelAnimationFrame(focusFrameRef.current)
        focusFrameRef.current = null
      }

      const markers = Array.from(markersByIdRef.current.values())
      if (mapRef.current && markers.length > 0) {
        mapRef.current.remove(markers)
      }
      markersByIdRef.current.clear()
      markerElementsByIdRef.current.clear()
      markerActivitiesByIdRef.current.clear()
      markerClickHandlersByIdRef.current.clear()
      mapRef.current?.destroy()
      mapRef.current = null
      amapRef.current = null
    }
  }, [])

  useEffect(() => {
    const amap = amapRef.current
    const map = mapRef.current
    if (!isMapReady || !amap || !map) {
      return
    }

    const nextActivityIds = new Set(markerLayouts.map((layout) => layout.activity.id))
    const removedMarkers: AMapMarker[] = []

    markersByIdRef.current.forEach((marker, activityId) => {
      if (nextActivityIds.has(activityId)) {
        return
      }

      const clickHandler = markerClickHandlersByIdRef.current.get(activityId)
      if (clickHandler) {
        marker.off('click', clickHandler)
      }
      removedMarkers.push(marker)
      markersByIdRef.current.delete(activityId)
      markerElementsByIdRef.current.delete(activityId)
      markerActivitiesByIdRef.current.delete(activityId)
      markerClickHandlersByIdRef.current.delete(activityId)
    })

    if (removedMarkers.length > 0) {
      map.remove(removedMarkers)
    }

    const addedMarkers: AMapMarker[] = []

    markerLayouts.forEach((layout) => {
      const { activity, offset } = layout
      const isSelected = selectedActivityIdRef.current === activity.id
      markerActivitiesByIdRef.current.set(activity.id, activity)

      const existingMarker = markersByIdRef.current.get(activity.id)

      if (existingMarker) {
        const elements = markerElementsByIdRef.current.get(activity.id)
        if (elements) {
          updateMarkerContent(elements, activity, isSelected)
        }
        existingMarker.setOffset(new amap.Pixel(offset.x, offset.y))
        existingMarker.setPosition(toAmapPosition(activity))
        existingMarker.setzIndex(getMarkerZIndex(layout, isSelected))
        return
      }

      const elements = createMarkerContent(activity, isSelected)
      const marker = new amap.Marker({
        anchor: 'center',
        content: elements.shell,
        offset: new amap.Pixel(offset.x, offset.y),
        position: toAmapPosition(activity),
        zIndex: getMarkerZIndex(layout, isSelected),
      })

      const clickHandler = () => {
        const currentActivity = markerActivitiesByIdRef.current.get(activity.id)
        if (currentActivity) {
          onSelectRef.current(currentActivity)
        }
      }

      marker.on('click', clickHandler)
      markersByIdRef.current.set(activity.id, marker)
      markerElementsByIdRef.current.set(activity.id, elements)
      markerClickHandlersByIdRef.current.set(activity.id, clickHandler)
      addedMarkers.push(marker)
    })

    if (addedMarkers.length > 0) {
      map.add(addedMarkers)
    }

    const markers = getCurrentMarkers()
    if (markers.length > 0 && !selectedActivityIdRef.current && !hasFitInitialMarkersRef.current) {
      hasFitInitialMarkersRef.current = true
      fitActivities(map, markers, markerLayouts)
    }
  }, [getCurrentMarkers, isMapReady, markerLayouts])

  useEffect(() => {
    const previousActivityId = selectedActivityIdRef.current

    if (previousActivityId === selectedActivityId) {
      return
    }

    if (previousActivityId) {
      applyMarkerSelectedState(previousActivityId, false)
    }

    if (selectedActivityId) {
      applyMarkerSelectedState(selectedActivityId, true)
    }

    selectedActivityIdRef.current = selectedActivityId
  }, [applyMarkerSelectedState, selectedActivityId])

  useEffect(() => {
    const map = mapRef.current
    if (!isMapReady || !map || fitAllRequest === 0) {
      return
    }

    fitActivities(map, getCurrentMarkers(), markerLayouts)
  }, [fitAllRequest, getCurrentMarkers, isMapReady, markerLayouts])

  useEffect(() => {
    const map = mapRef.current
    if (!isMapReady || !map || !selectedPosition) {
      return
    }

    const targetZoom = Math.max(map.getZoom(), AMAP_FOCUS_MIN_ZOOM)

    focusPosition(selectedPosition, targetZoom)
  }, [focusPosition, isMapReady, selectedPosition])

  useEffect(() => {
    const map = mapRef.current
    if (!isMapReady || !map || !selectedPosition || focusSelectedRequest === 0) {
      return
    }

    focusPosition(selectedPosition, AMAP_FOCUS_MIN_ZOOM)
  }, [focusPosition, focusSelectedRequest, isMapReady, selectedPosition])

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {loadError ? (
        <div className="absolute inset-0 z-[360] flex items-center justify-center bg-[#fff7ed] px-4 text-center">
          <div className="max-w-md rounded-[24px] border border-orange-200 bg-white px-6 py-5 shadow-[0_20px_60px_rgba(124,45,18,0.14)]">
            <p className="text-sm font-extrabold text-slate-950">地图暂时无法加载</p>
            <p className="mt-2 text-xs leading-5 text-slate-600">{loadError}</p>
          </div>
        </div>
      ) : null}
    </div>
  )
}

const AmapViewport = memo(AmapViewportComponent)

export default AmapViewport
