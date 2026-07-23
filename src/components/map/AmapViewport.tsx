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
import {
  MARKER_EXPANSION_MIN_ZOOM,
  layoutViewportMarkers,
  type ViewportMarkerGroup,
} from '@/lib/markerLayout'
import type { Activity } from '@/types/activity'

type AmapViewportProps = {
  activities: Activity[]
  selectedActivity: Activity | null
  selectedActivityId: string | null
  fitAllRequest: number
  focusSelectedRequest: number
  onSelect: (activity: Activity) => void
}

type AMapPixelValue = {
  getX?: () => number
  getY?: () => number
  x?: number
  y?: number
}

type AMapLngLatValue = {
  getLng?: () => number
  getLat?: () => number
  lng?: number
  lat?: number
}

type AMapOverlay = AMapMarker | AMapPolyline

type AMapNamespace = typeof globalThis & {
  Map: new (container: HTMLDivElement, options: Record<string, unknown>) => AMapMap
  Marker: new (options: Record<string, unknown>) => AMapMarker
  Pixel: new (x: number, y: number) => unknown
  Polyline: new (options: Record<string, unknown>) => AMapPolyline
}

type AMapMap = {
  add: (target: AMapOverlay | AMapOverlay[]) => void
  containerToLngLat: (pixel: unknown) => AMapLngLatValue
  destroy: () => void
  getZoom: () => number
  lngLatToContainer: (position: AmapLngLat) => AMapPixelValue
  off: (eventName: string, callback?: () => void) => void
  on: (eventName: string, callback: () => void) => void
  remove: (target: AMapOverlay | AMapOverlay[]) => void
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
  hide: () => void
  off: (eventName: string, callback?: () => void) => void
  on: (eventName: string, callback: () => void) => void
  setOffset: (offset: unknown) => void
  setPosition: (position: AmapLngLat) => void
  setzIndex: (zIndex: number) => void
  show: () => void
}

type AMapPolyline = Record<string, never>

type ActivityMarkerElements = {
  shell: HTMLDivElement
  marker: HTMLDivElement
  image: HTMLImageElement
  tooltip: HTMLDivElement
}

type ClusterMarkerElements = {
  shell: HTMLDivElement
  marker: HTMLDivElement
  image: HTMLImageElement
  badge: HTMLSpanElement
  tooltip: HTMLDivElement
}

type VisibleLayoutNode = {
  key: string
  kind: 'activity' | 'cluster'
  activityIds: string[]
  position: { x: number; y: number }
  marker: AMapMarker
  element: HTMLDivElement
}

const FOCUS_ANIMATION_DURATION_MS = 480
const CONNECTOR_MIN_LENGTH_PX = 1
const MARKER_SPLIT_DURATION_MS = 260
const CLUSTER_EXIT_DURATION_MS = 160
const MARKER_MERGE_DURATION_MS = 220
const CLUSTER_ENTER_DURATION_MS = 240
const MARKER_ENTER_EASING = 'cubic-bezier(0.16, 1, 0.3, 1)'
const MARKER_EXIT_EASING = 'cubic-bezier(0.4, 0, 1, 1)'

const toAmapPosition = (activity: Activity): AmapLngLat => [
  activity.longitude,
  activity.latitude,
]

const getPixelPosition = (pixel: AMapPixelValue): { x: number; y: number } => ({
  x: pixel.getX?.() ?? pixel.x ?? 0,
  y: pixel.getY?.() ?? pixel.y ?? 0,
})

const getLngLatPosition = (position: AMapLngLatValue): AmapLngLat => [
  position.getLng?.() ?? position.lng ?? 0,
  position.getLat?.() ?? position.lat ?? 0,
]

const getMarkerZIndex = (
  groupSize: number,
  groupIndex: number,
  isSelected: boolean
): number => (isSelected ? 140 : 100 + groupSize - groupIndex)

const getActivityNodeKey = (activityId: string): string => `activity:${activityId}`
const getClusterNodeKey = (groupKey: string): string => `cluster:${groupKey}`

const getActivityOverlapCount = (first: VisibleLayoutNode, second: VisibleLayoutNode): number => {
  const secondActivityIds = new Set(second.activityIds)
  return first.activityIds.reduce(
    (count, activityId) => count + (secondActivityIds.has(activityId) ? 1 : 0),
    0
  )
}

const getOverlappingNodes = (
  node: VisibleLayoutNode,
  candidates: VisibleLayoutNode[]
): VisibleLayoutNode[] =>
  candidates.filter((candidate) => getActivityOverlapCount(node, candidate) > 0)

const getBestOverlappingNode = (
  node: VisibleLayoutNode,
  candidates: VisibleLayoutNode[]
): VisibleLayoutNode | null => {
  let bestMatch: VisibleLayoutNode | null = null
  let bestOverlapCount = 0

  candidates.forEach((candidate) => {
    const overlapCount = getActivityOverlapCount(node, candidate)
    if (overlapCount > bestOverlapCount) {
      bestOverlapCount = overlapCount
      bestMatch = candidate
    }
  })

  return bestMatch
}

const haveSameLayoutTopology = (
  previousNodes: VisibleLayoutNode[],
  nextNodes: VisibleLayoutNode[]
): boolean => {
  if (previousNodes.length !== nextNodes.length) {
    return false
  }

  const previousKeys = new Set(previousNodes.map(({ key }) => key))
  return nextNodes.every(({ key }) => previousKeys.has(key))
}

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
    elements.image.style.display = ''
    elements.marker.classList.remove('is-fallback')
    elements.image.src = activity.markerThumbnail
  }
  elements.image.alt = activity.title
  elements.tooltip.textContent = `${activity.date} ${activity.title}`
}

const createClusterContent = (group: ViewportMarkerGroup): ClusterMarkerElements => {
  const newestActivity = group.activities[0]
  const label = `附近 ${group.activities.length} 个活动 · 点击放大`

  const shell = document.createElement('div')
  shell.className = 'amap-activity-cluster-shell'
  shell.setAttribute('aria-label', label)

  const marker = document.createElement('div')
  marker.className = 'activity-marker-cluster'

  const image = document.createElement('img')
  image.src = newestActivity.markerThumbnail
  image.alt = ''
  image.width = 56
  image.height = 56
  image.loading = 'lazy'
  image.decoding = 'async'
  image.fetchPriority = 'low'
  image.onerror = () => {
    image.style.display = 'none'
    marker.classList.add('is-fallback')
  }

  const badge = document.createElement('span')
  badge.className = 'activity-marker-cluster-count'
  badge.textContent = String(group.activities.length)
  badge.setAttribute('aria-hidden', 'true')

  const tooltip = document.createElement('div')
  tooltip.className = 'activity-marker-tooltip amap-activity-marker-tooltip'
  tooltip.textContent = label

  marker.appendChild(image)
  marker.appendChild(badge)
  shell.appendChild(marker)
  shell.appendChild(tooltip)

  return { shell, marker, image, badge, tooltip }
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
  const activitiesRef = useRef(activities)
  const markersByIdRef = useRef<Map<string, AMapMarker>>(new Map())
  const markerElementsByIdRef = useRef<Map<string, ActivityMarkerElements>>(new Map())
  const markerActivitiesByIdRef = useRef<Map<string, Activity>>(new Map())
  const markerClickHandlersByIdRef = useRef<Map<string, () => void>>(new Map())
  const clusterMarkersByKeyRef = useRef<Map<string, AMapMarker>>(new Map())
  const clusterElementsByKeyRef = useRef<Map<string, ClusterMarkerElements>>(new Map())
  const clusterActivitiesByKeyRef = useRef<Map<string, Activity[]>>(new Map())
  const clusterClickHandlersByKeyRef = useRef<Map<string, () => void>>(new Map())
  const connectorLinesRef = useRef<AMapPolyline[]>([])
  const visibleLayoutNodesRef = useRef<VisibleLayoutNode[]>([])
  const activeLayoutAnimationsRef = useRef<Animation[]>([])
  const transitionCleanupRef = useRef<(() => void) | null>(null)
  const transitionGenerationRef = useRef(0)
  const pendingAnimateTopologyRef = useRef(false)
  const hasFitInitialMarkersRef = useRef(false)
  const selectedActivityIdRef = useRef<string | null>(selectedActivityId)
  const focusFrameRef = useRef<number | null>(null)
  const layoutFrameRef = useRef<number | null>(null)
  const onSelectRef = useRef(onSelect)
  const [isMapReady, setIsMapReady] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const selectedPosition = useMemo(
    () => (selectedActivity ? toAmapPosition(selectedActivity) : null),
    [selectedActivity]
  )

  useEffect(() => {
    activitiesRef.current = activities
  }, [activities])

  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])

  const getCurrentMarkers = useCallback(
    () =>
      activitiesRef.current
        .map((activity) => markersByIdRef.current.get(activity.id))
        .filter((marker): marker is AMapMarker => Boolean(marker)),
    []
  )

  const resetMarkersToRealPositions = useCallback((targetActivities: Activity[]) => {
    const amap = amapRef.current
    if (!amap) {
      return
    }

    targetActivities.forEach((activity) => {
      const marker = markersByIdRef.current.get(activity.id)
      if (!marker) {
        return
      }
      marker.setOffset(new amap.Pixel(0, 0))
      marker.setPosition(toAmapPosition(activity))
    })
  }, [])

  const removeConnectorLines = useCallback(() => {
    const map = mapRef.current
    if (map && connectorLinesRef.current.length > 0) {
      map.remove(connectorLinesRef.current)
    }
    connectorLinesRef.current = []
  }, [])

  const removeClusterMarker = useCallback((groupKey: string) => {
    const map = mapRef.current
    const marker = clusterMarkersByKeyRef.current.get(groupKey)
    const clickHandler = clusterClickHandlersByKeyRef.current.get(groupKey)

    if (marker) {
      if (clickHandler) {
        marker.off('click', clickHandler)
      }
      map?.remove(marker)
    }

    clusterMarkersByKeyRef.current.delete(groupKey)
    clusterElementsByKeyRef.current.delete(groupKey)
    clusterActivitiesByKeyRef.current.delete(groupKey)
    clusterClickHandlersByKeyRef.current.delete(groupKey)
  }, [])

  const cancelActiveTransition = useCallback(() => {
    transitionGenerationRef.current += 1
    activeLayoutAnimationsRef.current.forEach((animation) => animation.cancel())
    activeLayoutAnimationsRef.current = []

    const cleanup = transitionCleanupRef.current
    transitionCleanupRef.current = null
    cleanup?.()
  }, [])

  const focusCluster = useCallback(
    (groupKey: string) => {
      const map = mapRef.current
      const groupActivities = clusterActivitiesByKeyRef.current.get(groupKey)
      if (!map || !groupActivities || groupActivities.length === 0) {
        return
      }

      resetMarkersToRealPositions(groupActivities)
      const markers = groupActivities
        .map((activity) => markersByIdRef.current.get(activity.id))
        .filter((marker): marker is AMapMarker => Boolean(marker))

      try {
        if (map.setFitView && markers.length > 1) {
          map.setFitView(markers, false, [96, 72, 96, 72], MARKER_EXPANSION_MIN_ZOOM)
        } else {
          map.setZoomAndCenter(
            MARKER_EXPANSION_MIN_ZOOM,
            toAmapPosition(groupActivities[0]),
            false,
            FOCUS_ANIMATION_DURATION_MS
          )
        }
      } catch {
        map.setZoomAndCenter(
          MARKER_EXPANSION_MIN_ZOOM,
          toAmapPosition(groupActivities[0]),
          false,
          FOCUS_ANIMATION_DURATION_MS
        )
      }
    },
    [resetMarkersToRealPositions]
  )

  const applyViewportLayout = useCallback((animateTopology: boolean) => {
    const amap = amapRef.current
    const map = mapRef.current
    const container = containerRef.current
    if (!amap || !map || !container) {
      return
    }

    if (!animateTopology && activeLayoutAnimationsRef.current.length > 0) {
      return
    }

    cancelActiveTransition()

    const previousNodes = visibleLayoutNodesRef.current
    const previousConnectorLines = connectorLinesRef.current
    const previousCenters = new Map<string, { x: number; y: number }>()

    previousNodes.forEach((node) => {
      const rect = node.element.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        previousCenters.set(node.key, {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2,
        })
      }
    })

    const currentActivities = activitiesRef.current
    const layouts = layoutViewportMarkers(
      currentActivities,
      (activity) => getPixelPosition(map.lngLatToContainer(toAmapPosition(activity))),
      {
        zoom: map.getZoom(),
        selectedActivityId: selectedActivityIdRef.current,
      }
    )
    const activeClusterKeys = new Set<string>()
    const visibleActivityIds = new Set<string>()
    const nextConnectorLines: AMapPolyline[] = []
    const nextNodes: VisibleLayoutNode[] = []

    layouts.forEach((group) => {
      if (group.activities.length > 1 && !group.isExpanded) {
        activeClusterKeys.add(group.key)
        clusterActivitiesByKeyRef.current.set(group.key, group.activities)

        const clusterPosition = getLngLatPosition(
          map.containerToLngLat(new amap.Pixel(group.center.x, group.center.y))
        )
        const existingCluster = clusterMarkersByKeyRef.current.get(group.key)

        if (existingCluster) {
          existingCluster.setPosition(clusterPosition)
          existingCluster.show()
          const elements = clusterElementsByKeyRef.current.get(group.key)
          if (elements) {
            nextNodes.push({
              key: getClusterNodeKey(group.key),
              kind: 'cluster',
              activityIds: group.activities.map(({ id }) => id),
              position: group.center,
              marker: existingCluster,
              element: elements.shell,
            })
          }
          return
        }

        const elements = createClusterContent(group)
        const clusterMarker = new amap.Marker({
          anchor: 'center',
          content: elements.shell,
          position: clusterPosition,
          zIndex: 125,
        })
        const clickHandler = () => focusCluster(group.key)

        clusterMarker.on('click', clickHandler)
        clusterMarkersByKeyRef.current.set(group.key, clusterMarker)
        clusterElementsByKeyRef.current.set(group.key, elements)
        clusterClickHandlersByKeyRef.current.set(group.key, clickHandler)
        map.add(clusterMarker)
        nextNodes.push({
          key: getClusterNodeKey(group.key),
          kind: 'cluster',
          activityIds: group.activities.map(({ id }) => id),
          position: group.center,
          marker: clusterMarker,
          element: elements.shell,
        })
        return
      }

      group.markers.forEach(({ activity, position, groupIndex, groupSize }) => {
        const marker = markersByIdRef.current.get(activity.id)
        const elements = markerElementsByIdRef.current.get(activity.id)
        if (!marker || !elements) {
          return
        }

        const displayPosition = getLngLatPosition(
          map.containerToLngLat(new amap.Pixel(position.x, position.y))
        )
        const isSelected = selectedActivityIdRef.current === activity.id

        marker.setOffset(new amap.Pixel(0, 0))
        marker.setPosition(displayPosition)
        marker.setzIndex(getMarkerZIndex(groupSize, groupIndex, isSelected))
        marker.show()
        visibleActivityIds.add(activity.id)
        nextNodes.push({
          key: getActivityNodeKey(activity.id),
          kind: 'activity',
          activityIds: [activity.id],
          position,
          marker,
          element: elements.shell,
        })

        const realPoint = getPixelPosition(map.lngLatToContainer(toAmapPosition(activity)))
        if (
          group.isExpanded &&
          Math.hypot(position.x - realPoint.x, position.y - realPoint.y) >=
            CONNECTOR_MIN_LENGTH_PX
        ) {
          nextConnectorLines.push(
            new amap.Polyline({
              path: [toAmapPosition(activity), displayPosition],
              strokeColor: '#2563eb',
              strokeOpacity: 0.34,
              strokeStyle: 'dashed',
              strokeWeight: 2,
              zIndex: 80,
            })
          )
        }
      })
    })

    if (nextConnectorLines.length > 0) {
      map.add(nextConnectorLines)
    }

    connectorLinesRef.current = nextConnectorLines

    let hasFinalized = false
    const finalizeLayout = () => {
      if (hasFinalized) {
        return
      }
      hasFinalized = true

      const transitionElements = new Set(
        [...previousNodes, ...nextNodes].map(({ element }) => element)
      )
      transitionElements.forEach((element) => {
        element.style.pointerEvents = ''
      })

      markersByIdRef.current.forEach((marker, activityId) => {
        if (!visibleActivityIds.has(activityId)) {
          marker.hide()
        }
      })

      Array.from(clusterMarkersByKeyRef.current.keys()).forEach((groupKey) => {
        if (!activeClusterKeys.has(groupKey)) {
          removeClusterMarker(groupKey)
        }
      })

      if (previousConnectorLines.length > 0) {
        map.remove(previousConnectorLines)
      }

      connectorLinesRef.current = nextConnectorLines
      visibleLayoutNodesRef.current = nextNodes
    }

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const shouldAnimate =
      animateTopology &&
      !prefersReducedMotion &&
      previousNodes.length > 0 &&
      !haveSameLayoutTopology(previousNodes, nextNodes)

    if (!shouldAnimate) {
      finalizeLayout()
      return
    }

    const containerRect = container.getBoundingClientRect()
    const nextCenters = new Map(
      nextNodes.map((node) => [
        node.key,
        {
          x: containerRect.left + node.position.x,
          y: containerRect.top + node.position.y,
        },
      ])
    )
    const previousNodeKeys = new Set(previousNodes.map(({ key }) => key))
    const nextNodeKeys = new Set(nextNodes.map(({ key }) => key))
    const transitionElements = new Set(
      [...previousNodes, ...nextNodes].map(({ element }) => element)
    )
    transitionElements.forEach((element) => {
      element.style.pointerEvents = 'none'
    })

    const animations: Animation[] = []
    const startAnimation = (
      element: HTMLDivElement,
      keyframes: Keyframe[],
      duration: number,
      easing: string
    ) => {
      animations.push(
        element.animate(keyframes, {
          duration,
          easing,
          fill: 'both',
        })
      )
    }

    nextNodes.forEach((node) => {
      if (previousNodeKeys.has(node.key)) {
        return
      }

      const overlappingPreviousNodes = getOverlappingNodes(node, previousNodes)
      const sourceNode = getBestOverlappingNode(node, previousNodes)
      const sourceCenter = sourceNode ? previousCenters.get(sourceNode.key) : null
      const targetCenter = nextCenters.get(node.key)
      const isMergeTarget = node.kind === 'cluster' && overlappingPreviousNodes.length > 1

      if (sourceCenter && targetCenter && !isMergeTarget) {
        startAnimation(
          node.element,
          [
            {
              opacity: 0,
              transform: `translate3d(${sourceCenter.x - targetCenter.x}px, ${sourceCenter.y - targetCenter.y}px, 0) scale(0.72)`,
            },
            { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' },
          ],
          MARKER_SPLIT_DURATION_MS,
          MARKER_ENTER_EASING
        )
        return
      }

      startAnimation(
        node.element,
        [
          { opacity: 0, transform: 'translate3d(0, 0, 0) scale(0.82)' },
          { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' },
        ],
        CLUSTER_ENTER_DURATION_MS,
        MARKER_ENTER_EASING
      )
    })

    previousNodes.forEach((node) => {
      if (nextNodeKeys.has(node.key)) {
        return
      }

      const sourceCenter = previousCenters.get(node.key)
      const overlappingNextNodes = getOverlappingNodes(node, nextNodes)
      const targetNode = getBestOverlappingNode(node, nextNodes)
      const targetCenter = targetNode ? nextCenters.get(targetNode.key) : null
      const isSplitSource = node.kind === 'cluster' && overlappingNextNodes.length > 1

      if (sourceCenter && targetCenter && !isSplitSource) {
        startAnimation(
          node.element,
          [
            { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' },
            {
              opacity: 0,
              transform: `translate3d(${targetCenter.x - sourceCenter.x}px, ${targetCenter.y - sourceCenter.y}px, 0) scale(0.72)`,
            },
          ],
          MARKER_MERGE_DURATION_MS,
          MARKER_EXIT_EASING
        )
        return
      }

      startAnimation(
        node.element,
        [
          { opacity: 1, transform: 'translate3d(0, 0, 0) scale(1)' },
          { opacity: 0, transform: 'translate3d(0, 0, 0) scale(0.82)' },
        ],
        CLUSTER_EXIT_DURATION_MS,
        MARKER_EXIT_EASING
      )
    })

    if (animations.length === 0) {
      finalizeLayout()
      return
    }

    const transitionGeneration = transitionGenerationRef.current + 1
    transitionGenerationRef.current = transitionGeneration
    activeLayoutAnimationsRef.current = animations
    visibleLayoutNodesRef.current = nextNodes
    transitionCleanupRef.current = finalizeLayout

    Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
      if (transitionGenerationRef.current !== transitionGeneration) {
        return
      }

      transitionCleanupRef.current = null
      activeLayoutAnimationsRef.current = []
      finalizeLayout()
      animations.forEach((animation) => animation.cancel())
    })
  }, [cancelActiveTransition, focusCluster, removeClusterMarker])

  const scheduleViewportLayout = useCallback((animateTopology = false) => {
    pendingAnimateTopologyRef.current =
      pendingAnimateTopologyRef.current || animateTopology

    if (layoutFrameRef.current !== null) {
      window.cancelAnimationFrame(layoutFrameRef.current)
    }

    layoutFrameRef.current = window.requestAnimationFrame(() => {
      layoutFrameRef.current = null
      const shouldAnimateTopology = pendingAnimateTopologyRef.current
      pendingAnimateTopologyRef.current = false
      applyViewportLayout(shouldAnimateTopology)
    })
  }, [applyViewportLayout])

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
      if (layoutFrameRef.current !== null) {
        window.cancelAnimationFrame(layoutFrameRef.current)
        layoutFrameRef.current = null
      }

      cancelActiveTransition()
      removeConnectorLines()
      Array.from(clusterMarkersByKeyRef.current.keys()).forEach(removeClusterMarker)

      const markers = Array.from(markersByIdRef.current.values())
      if (mapRef.current && markers.length > 0) {
        mapRef.current.remove(markers)
      }
      markersByIdRef.current.clear()
      markerElementsByIdRef.current.clear()
      markerActivitiesByIdRef.current.clear()
      markerClickHandlersByIdRef.current.clear()
      visibleLayoutNodesRef.current = []
      mapRef.current?.destroy()
      mapRef.current = null
      amapRef.current = null
    }
  }, [cancelActiveTransition, removeClusterMarker, removeConnectorLines])

  useEffect(() => {
    const map = mapRef.current
    if (!isMapReady || !map) {
      return
    }

    const handleZoomEnded = () => scheduleViewportLayout(true)
    const handleMoveEnded = () => scheduleViewportLayout(false)
    map.on('zoomend', handleZoomEnded)
    map.on('moveend', handleMoveEnded)
    scheduleViewportLayout()

    return () => {
      map.off('zoomend', handleZoomEnded)
      map.off('moveend', handleMoveEnded)
    }
  }, [isMapReady, scheduleViewportLayout])

  useEffect(() => {
    const amap = amapRef.current
    const map = mapRef.current
    if (!isMapReady || !amap || !map) {
      return
    }

    const nextActivityIds = new Set(activities.map((activity) => activity.id))
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

    activities.forEach((activity) => {
      const isSelected = selectedActivityIdRef.current === activity.id
      markerActivitiesByIdRef.current.set(activity.id, activity)

      const existingMarker = markersByIdRef.current.get(activity.id)

      if (existingMarker) {
        const elements = markerElementsByIdRef.current.get(activity.id)
        if (elements) {
          updateMarkerContent(elements, activity, isSelected)
        }
        existingMarker.setOffset(new amap.Pixel(0, 0))
        existingMarker.setzIndex(getMarkerZIndex(1, 0, isSelected))
        return
      }

      const elements = createMarkerContent(activity, isSelected)
      const marker = new amap.Marker({
        anchor: 'center',
        content: elements.shell,
        position: toAmapPosition(activity),
        zIndex: getMarkerZIndex(1, 0, isSelected),
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
      fitActivities(map, markers, activities)
    }
    scheduleViewportLayout(true)
  }, [activities, getCurrentMarkers, isMapReady, scheduleViewportLayout])

  useEffect(() => {
    const previousActivityId = selectedActivityIdRef.current

    if (previousActivityId && previousActivityId !== selectedActivityId) {
      markerElementsByIdRef.current.get(previousActivityId)?.marker.classList.remove('selected')
    }

    if (selectedActivityId) {
      markerElementsByIdRef.current.get(selectedActivityId)?.marker.classList.add('selected')
    }

    selectedActivityIdRef.current = selectedActivityId
    scheduleViewportLayout(true)
  }, [scheduleViewportLayout, selectedActivityId])

  useEffect(() => {
    const map = mapRef.current
    if (!isMapReady || !map || fitAllRequest === 0) {
      return
    }

    resetMarkersToRealPositions(activities)
    fitActivities(map, getCurrentMarkers(), activities)
    scheduleViewportLayout()
  }, [
    activities,
    fitAllRequest,
    getCurrentMarkers,
    isMapReady,
    resetMarkersToRealPositions,
    scheduleViewportLayout,
  ])

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
