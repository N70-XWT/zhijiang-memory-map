'use client'

import AMapLoader from '@amap/amap-jsapi-loader'
import { memo, useEffect, useMemo, useRef, useState } from 'react'
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
  off: (eventName: string) => void
  on: (eventName: string, callback: () => void) => void
}

const toAmapPosition = (activity: Activity): AmapLngLat => [
  activity.longitude,
  activity.latitude,
]

const fitActivities = (map: AMapMap, markers: AMapMarker[], activities: Activity[]) => {
  if (markers.length === 0 || activities.length === 0) {
    return
  }

  try {
    if (markers.length === 1) {
      map.setZoomAndCenter(
        AMAP_INITIAL_SINGLE_MARKER_ZOOM,
        toAmapPosition(activities[0]),
        false,
        550
      )
    } else if (map.setFitView) {
      map.setFitView(markers, false, [260, 80, 120, 80], AMAP_INITIAL_FIT_MAX_ZOOM)
    } else {
      map.setZoomAndCenter(
        AMAP_INITIAL_FIT_MAX_ZOOM,
        toAmapPosition(activities[0]),
        false,
        550
      )
    }
  } catch {
    map.setCenter(toAmapPosition(activities[0]))
  }
}

const createMarkerContent = (activity: Activity, isSelected: boolean): HTMLDivElement => {
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

  return shell
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
  const markersRef = useRef<AMapMarker[]>([])
  const hasFitInitialMarkersRef = useRef(false)
  const [isMapReady, setIsMapReady] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const selectedPosition = useMemo(
    () => (selectedActivity ? toAmapPosition(selectedActivity) : null),
    [selectedActivity]
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
      if (mapRef.current && markersRef.current.length > 0) {
        mapRef.current.remove(markersRef.current)
      }
      markersRef.current = []
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

    if (markersRef.current.length > 0) {
      map.remove(markersRef.current)
      markersRef.current = []
    }

    const markers = activities.map((activity) => {
      const marker = new amap.Marker({
        anchor: 'center',
        content: createMarkerContent(activity, selectedActivityId === activity.id),
        offset: new amap.Pixel(0, 0),
        position: toAmapPosition(activity),
        zIndex: selectedActivityId === activity.id ? 120 : 100,
      })

      marker.on('click', () => onSelect(activity))
      return marker
    })

    if (markers.length > 0) {
      map.add(markers)

      if (!selectedActivityId && !hasFitInitialMarkersRef.current) {
        hasFitInitialMarkersRef.current = true
        fitActivities(map, markers, activities)
      }
    }
    markersRef.current = markers
  }, [activities, isMapReady, onSelect, selectedActivityId])

  useEffect(() => {
    const map = mapRef.current
    if (!isMapReady || !map || fitAllRequest === 0) {
      return
    }

    fitActivities(map, markersRef.current, activities)
  }, [activities, fitAllRequest, isMapReady])

  useEffect(() => {
    const map = mapRef.current
    if (!isMapReady || !map || !selectedPosition) {
      return
    }

    const targetZoom = Math.max(map.getZoom(), AMAP_FOCUS_MIN_ZOOM)

    try {
      map.setZoomAndCenter(targetZoom, selectedPosition, false, 550)
    } catch {
      map.setCenter(selectedPosition)
    }
  }, [isMapReady, selectedPosition])

  useEffect(() => {
    const map = mapRef.current
    if (!isMapReady || !map || !selectedPosition || focusSelectedRequest === 0) {
      return
    }

    try {
      map.setZoomAndCenter(AMAP_FOCUS_MIN_ZOOM, selectedPosition, false, 550)
    } catch {
      map.setCenter(selectedPosition)
    }
  }, [focusSelectedRequest, isMapReady, selectedPosition])

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {loadError ? (
        <div className="absolute inset-0 z-[360] flex items-center justify-center bg-slate-100 px-4 text-center text-sm text-slate-700">
          {loadError}
        </div>
      ) : null}
    </div>
  )
}

const AmapViewport = memo(AmapViewportComponent)

export default AmapViewport
