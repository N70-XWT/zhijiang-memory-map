'use client'

import { memo, startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { MapContainer, TileLayer, ZoomControl, useMap } from 'react-leaflet'
import ActivityFilterBar from '@/components/filters/ActivityFilterBar'
import ActivityResultList from '@/components/map/ActivityResultList'
import MemoryTimeline from '@/components/map/MemoryTimeline'
import ActivityDetailPanel from '@/components/panel/ActivityDetailPanel'
import {
  CHINA_MAP_CENTER,
  CHINA_MAP_MAX_ZOOM,
  CHINA_MAP_MIN_ZOOM,
  CHINA_MAP_ZOOM,
  TILE_LAYER_ATTRIBUTION,
  TILE_LAYER_KEEP_BUFFER,
  TILE_LAYER_MAX_NATIVE_ZOOM,
  TILE_LAYER_URL,
} from '@/lib/map'
import { layoutActivityMarkers } from '@/lib/markerLayout'
import type { Activity } from '@/types/activity'
import ActivityMarker from './ActivityMarker'
import AmapViewport from './AmapViewport'

type FullscreenMapProps = {
  activities: Activity[]
}

type MapViewportProps = {
  activities: Activity[]
  selectedActivity: Activity | null
  selectedActivityId: string | null
  onSelect: (activity: Activity) => void
}

type MapFocusControllerProps = {
  selectedActivity: Activity | null
}

type NoticeOverlayProps = {
  title: string
  description: string
}

const ALL_OPTION = 'all'
const MOBILE_VIEWPORT_QUERY = '(max-width: 767px)'
const TIMELINE_PANEL_DELAY_MS = 110

const getLatestActivityId = (activities: Activity[]) => {
  let latestActivity: Activity | null = null
  for (const activity of activities) {
    if (
      !latestActivity ||
      activity.date > latestActivity.date ||
      (activity.date === latestActivity.date && activity.id > latestActivity.id)
    ) {
      latestActivity = activity
    }
  }
  return latestActivity?.id ?? null
}

const setOptionalQueryParam = (params: URLSearchParams, key: string, value: string) => {
  const normalizedValue = value.trim()
  if (normalizedValue.length === 0 || normalizedValue === ALL_OPTION) {
    params.delete(key)
    return
  }
  params.set(key, normalizedValue)
}

function NoticeOverlay({ title, description }: NoticeOverlayProps) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[calc(132px+env(safe-area-inset-bottom))] z-[420] flex justify-center px-4 md:bottom-[116px]">
      <div className="pointer-events-auto w-full max-w-xl rounded-2xl border border-orange-200/80 bg-[#fffaf5]/95 px-4 py-3 text-center shadow-[0_14px_38px_rgba(124,45,18,0.15)] backdrop-blur-md">
        <p className="text-sm font-extrabold text-slate-950">{title}</p>
        <p className="mt-1 text-xs text-slate-500">{description}</p>
      </div>
    </div>
  )
}

function InvalidQueryNotice({ compactTop }: { compactTop: boolean }) {
  return (
    <div
      className={`pointer-events-none absolute inset-x-0 z-[425] flex justify-center px-4 ${
        compactTop ? 'top-[104px] md:top-[112px]' : 'top-[310px] md:top-[152px]'
      }`}
    >
      <div className="pointer-events-auto rounded-xl border border-orange-300 bg-orange-50/95 px-3.5 py-2.5 text-xs font-semibold text-orange-900 shadow-sm backdrop-blur-md">
        URL 中的活动参数无效，已忽略该活动。
      </div>
    </div>
  )
}

function MapFocusController({ selectedActivity }: MapFocusControllerProps) {
  const map = useMap()
  const lastFocusedIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!selectedActivity) {
      lastFocusedIdRef.current = null
      return
    }

    if (lastFocusedIdRef.current === selectedActivity.id) {
      return
    }

    lastFocusedIdRef.current = selectedActivity.id

    const currentZoom = map.getZoom()
    const targetZoom = currentZoom < 6 ? 6 : currentZoom

    map.flyTo([selectedActivity.latitude, selectedActivity.longitude], targetZoom, {
      animate: true,
      duration: 0.55,
      easeLinearity: 0.25,
      noMoveStart: true,
    })
  }, [map, selectedActivity])

  return null
}

const MapViewport = memo(function MapViewport({
  activities,
  selectedActivity,
  selectedActivityId,
  onSelect,
}: MapViewportProps) {
  const markerLayouts = useMemo(() => layoutActivityMarkers(activities), [activities])

  return (
    <MapContainer
      center={CHINA_MAP_CENTER}
      zoom={CHINA_MAP_ZOOM}
      minZoom={CHINA_MAP_MIN_ZOOM}
      maxZoom={CHINA_MAP_MAX_ZOOM}
      zoomControl={false}
      scrollWheelZoom
      zoomAnimation
      fadeAnimation
      markerZoomAnimation
      inertia
      inertiaDeceleration={2800}
      easeLinearity={0.2}
      zoomSnap={0.25}
      zoomDelta={0.5}
      wheelDebounceTime={45}
      wheelPxPerZoomLevel={80}
      className="h-full w-full"
    >
      <TileLayer
        attribution={TILE_LAYER_ATTRIBUTION}
        url={TILE_LAYER_URL}
        updateWhenIdle={false}
        updateWhenZooming
        updateInterval={120}
        detectRetina={false}
        keepBuffer={TILE_LAYER_KEEP_BUFFER}
        maxNativeZoom={TILE_LAYER_MAX_NATIVE_ZOOM}
      />
      <ZoomControl position="bottomright" />

      {markerLayouts.map(({ activity, offset }) => (
        <ActivityMarker
          key={activity.id}
          activity={activity}
          offset={offset}
          isSelected={selectedActivityId === activity.id}
          onSelect={onSelect}
        />
      ))}

      <MapFocusController selectedActivity={selectedActivity} />
    </MapContainer>
  )
})

export default function FullscreenMap({ activities }: FullscreenMapProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null)
  const [isPanelOpen, setIsPanelOpen] = useState(false)
  const [cityFilter, setCityFilter] = useState<string>(() => searchParams.get('city') ?? ALL_OPTION)
  const [yearFilter, setYearFilter] = useState<string>(() => searchParams.get('year') ?? ALL_OPTION)
  const [eventTypeFilter, setEventTypeFilter] = useState<string>(() => searchParams.get('type') ?? ALL_OPTION)
  const [memberFilter, setMemberFilter] = useState<string>(() => searchParams.get('member') ?? ALL_OPTION)
  const [searchKeyword, setSearchKeyword] = useState<string>(() => searchParams.get('q') ?? '')
  const [invalidActivityParam, setInvalidActivityParam] = useState(false)
  const [isFilterCollapsed, setIsFilterCollapsed] = useState(false)
  const [isFilterHidden, setIsFilterHidden] = useState(false)
  const [isActivityListOpen, setIsActivityListOpen] = useState(false)
  const [timelineCursorId, setTimelineCursorId] = useState<string | null>(() =>
    getLatestActivityId(activities)
  )
  const [fitAllRequest, setFitAllRequest] = useState(0)
  const [focusSelectedRequest, setFocusSelectedRequest] = useState(0)
  const activityQueryFrameRef = useRef<number | null>(null)
  const panelOpenTimeoutRef = useRef<number | null>(null)
  const delayedPanelActivityIdRef = useRef<string | null>(null)

  const selectedActivityId = useMemo(() => selectedActivity?.id ?? null, [selectedActivity])

  const activitiesById = useMemo(() => new Map(activities.map((activity) => [activity.id, activity])), [activities])

  useEffect(() => {
    const mediaQuery = window.matchMedia(MOBILE_VIEWPORT_QUERY)

    const applyMobileDefault = () => {
      if (mediaQuery.matches) {
        setIsFilterCollapsed(true)
      }
    }

    applyMobileDefault()

    mediaQuery.addEventListener('change', applyMobileDefault)
    return () => {
      mediaQuery.removeEventListener('change', applyMobileDefault)
    }
  }, [])

  const cityOptions = useMemo(
    () => Array.from(new Set(activities.map((activity) => activity.city))).sort((a, b) => a.localeCompare(b)),
    [activities]
  )

  const yearOptions = useMemo(
    () => Array.from(new Set(activities.map((activity) => activity.year))).sort((a, b) => b - a),
    [activities]
  )

  const eventTypeOptions = useMemo(
    () =>
      Array.from(new Set(activities.map((activity) => activity.eventType))).sort((a, b) =>
        a.localeCompare(b)
      ),
    [activities]
  )

  const memberOptions = useMemo(
    () =>
      Array.from(new Set(activities.flatMap((activity) => activity.members))).sort((a, b) =>
        a.localeCompare(b)
      ),
    [activities]
  )

  const filteredActivities = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase()

    return activities.filter((activity) => {
      if (cityFilter !== ALL_OPTION && activity.city !== cityFilter) {
        return false
      }

      if (yearFilter !== ALL_OPTION && String(activity.year) !== yearFilter) {
        return false
      }

      if (eventTypeFilter !== ALL_OPTION && activity.eventType !== eventTypeFilter) {
        return false
      }

      if (memberFilter !== ALL_OPTION && !activity.members.includes(memberFilter)) {
        return false
      }

      if (keyword.length > 0) {
        const text = `${activity.title} ${activity.city} ${activity.venue}`.toLowerCase()
        if (!text.includes(keyword)) {
          return false
        }
      }

      return true
    })
  }, [activities, cityFilter, eventTypeFilter, memberFilter, searchKeyword, yearFilter])

  const filteredActivityIdSet = useMemo(
    () => new Set(filteredActivities.map((activity) => activity.id)),
    [filteredActivities]
  )

  const sortedFilteredActivities = useMemo(
    () =>
      [...filteredActivities].sort((left, right) => {
        const byDate = left.date.localeCompare(right.date)
        return byDate === 0 ? left.id.localeCompare(right.id) : byDate
      }),
    [filteredActivities]
  )

  const activeCriteriaCount = useMemo(() => {
    let count = 0
    if (cityFilter !== ALL_OPTION) count += 1
    if (yearFilter !== ALL_OPTION) count += 1
    if (eventTypeFilter !== ALL_OPTION) count += 1
    if (memberFilter !== ALL_OPTION) count += 1
    if (searchKeyword.trim().length > 0) count += 1
    return count
  }, [cityFilter, eventTypeFilter, memberFilter, searchKeyword, yearFilter])

  const hasActiveCriteria = activeCriteriaCount > 0

  const replaceQuery = useCallback(
    (mutateParams: (params: URLSearchParams) => void) => {
      const params =
        typeof window === 'undefined'
          ? new URLSearchParams()
          : new URLSearchParams(window.location.search)

      mutateParams(params)

      const query = params.toString()
      const next = query ? `${pathname}?${query}` : pathname
      const current =
        typeof window === 'undefined'
          ? pathname
          : `${window.location.pathname}${window.location.search}`

      if (current !== next) {
        router.replace(next, { scroll: false })
      }
    },
    [pathname, router]
  )

  const updateActivityQuery = useCallback(
    (activityId: string | null) => {
      if (activityQueryFrameRef.current !== null) {
        window.cancelAnimationFrame(activityQueryFrameRef.current)
      }

      activityQueryFrameRef.current = window.requestAnimationFrame(() => {
        activityQueryFrameRef.current = null

        startTransition(() => {
          replaceQuery((params) => {
            if (activityId) {
              params.set('activity', activityId)
              return
            }
            params.delete('activity')
          })
        })
      })
    },
    [replaceQuery]
  )

  useEffect(
    () => () => {
      if (activityQueryFrameRef.current !== null) {
        window.cancelAnimationFrame(activityQueryFrameRef.current)
        activityQueryFrameRef.current = null
      }
      if (panelOpenTimeoutRef.current !== null) {
        window.clearTimeout(panelOpenTimeoutRef.current)
        panelOpenTimeoutRef.current = null
      }
    },
    []
  )

  const commitActivitySelection = useCallback(
    (activity: Activity, options: { focusMap: boolean; delayPanel: boolean }) => {
      if (panelOpenTimeoutRef.current !== null) {
        window.clearTimeout(panelOpenTimeoutRef.current)
        panelOpenTimeoutRef.current = null
      }

      setSelectedActivity(activity)
      setTimelineCursorId(activity.id)
      setIsActivityListOpen(false)
      setInvalidActivityParam(false)

      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (options.delayPanel && !reduceMotion) {
        delayedPanelActivityIdRef.current = activity.id
        setIsPanelOpen(false)
        panelOpenTimeoutRef.current = window.setTimeout(() => {
          delayedPanelActivityIdRef.current = null
          panelOpenTimeoutRef.current = null
          setIsPanelOpen(true)
        }, TIMELINE_PANEL_DELAY_MS)
      } else {
        delayedPanelActivityIdRef.current = null
        setIsPanelOpen(true)
      }

      if (window.matchMedia(MOBILE_VIEWPORT_QUERY).matches) {
        setIsFilterCollapsed(true)
      }
      if (options.focusMap) {
        setFocusSelectedRequest((value) => value + 1)
      }
      updateActivityQuery(activity.id)
    },
    [updateActivityQuery]
  )

  const handleSelectActivity = useCallback(
    (activity: Activity) => {
      commitActivitySelection(activity, { focusMap: false, delayPanel: false })
    },
    [commitActivitySelection]
  )

  const handleSelectTimelineActivity = useCallback(
    (activity: Activity) => {
      commitActivitySelection(activity, { focusMap: true, delayPanel: !isPanelOpen })
    },
    [commitActivitySelection, isPanelOpen]
  )

  const handleSelectAdjacentActivity = useCallback(
    (activity: Activity) => {
      commitActivitySelection(activity, { focusMap: true, delayPanel: false })
    },
    [commitActivitySelection]
  )

  const handleClosePanel = useCallback(() => {
    if (activityQueryFrameRef.current !== null) {
      window.cancelAnimationFrame(activityQueryFrameRef.current)
      activityQueryFrameRef.current = null
    }

    if (panelOpenTimeoutRef.current !== null) {
      window.clearTimeout(panelOpenTimeoutRef.current)
      panelOpenTimeoutRef.current = null
    }
    delayedPanelActivityIdRef.current = null

    setSelectedActivity(null)
    setIsPanelOpen(false)
    setInvalidActivityParam(false)

    const params = new URLSearchParams(window.location.search)
    params.delete('activity')
    const query = params.toString()
    window.history.replaceState(window.history.state, '', query ? `${pathname}?${query}` : pathname)
  }, [pathname])

  const handleResetTimeline = useCallback(() => {
    if (panelOpenTimeoutRef.current !== null) {
      window.clearTimeout(panelOpenTimeoutRef.current)
      panelOpenTimeoutRef.current = null
    }
    delayedPanelActivityIdRef.current = null
    setTimelineCursorId(null)
    setSelectedActivity(null)
    setIsPanelOpen(false)
    setIsActivityListOpen(false)
    setInvalidActivityParam(false)
    updateActivityQuery(null)
    setFitAllRequest((value) => value + 1)
  }, [updateActivityQuery])

  const handleFocusSelectedActivity = useCallback(() => {
    setFocusSelectedRequest((value) => value + 1)
  }, [])

  const handleToggleActivityList = useCallback(() => {
    setIsActivityListOpen((value) => !value)
    setIsFilterCollapsed(true)
  }, [])

  const handleCloseActivityList = useCallback(() => {
    setIsActivityListOpen(false)
  }, [])

  const handleSelectActivityFromList = useCallback(
    (activity: Activity) => {
      commitActivitySelection(activity, { focusMap: true, delayPanel: false })
    },
    [commitActivitySelection]
  )

  const handleClearFilters = useCallback(() => {
    setCityFilter(ALL_OPTION)
    setYearFilter(ALL_OPTION)
    setEventTypeFilter(ALL_OPTION)
    setMemberFilter(ALL_OPTION)
    setSearchKeyword('')
  }, [])

  const handleToggleFilterCollapsed = useCallback(() => {
    setIsFilterCollapsed((previous) => !previous)
    setIsActivityListOpen(false)
  }, [])

  const handleHideFilterBar = useCallback(() => {
    setIsFilterHidden(true)
  }, [])

  const handleShowFilterBar = useCallback(() => {
    setIsFilterHidden(false)
    if (isActivityListOpen) {
      setIsFilterCollapsed(true)
    }
  }, [isActivityListOpen])

  const activityParam = searchParams.get('activity')

  useEffect(() => {
    if (cityFilter !== ALL_OPTION && !cityOptions.includes(cityFilter)) {
      setCityFilter(ALL_OPTION)
    }
  }, [cityFilter, cityOptions])

  useEffect(() => {
    if (yearFilter !== ALL_OPTION && !yearOptions.some((year) => String(year) === yearFilter)) {
      setYearFilter(ALL_OPTION)
    }
  }, [yearFilter, yearOptions])

  useEffect(() => {
    if (eventTypeFilter !== ALL_OPTION && !eventTypeOptions.includes(eventTypeFilter)) {
      setEventTypeFilter(ALL_OPTION)
    }
  }, [eventTypeFilter, eventTypeOptions])

  useEffect(() => {
    if (memberFilter !== ALL_OPTION && !memberOptions.includes(memberFilter)) {
      setMemberFilter(ALL_OPTION)
    }
  }, [memberFilter, memberOptions])

  useEffect(() => {
    replaceQuery((params) => {
      setOptionalQueryParam(params, 'city', cityFilter)
      setOptionalQueryParam(params, 'year', yearFilter)
      setOptionalQueryParam(params, 'type', eventTypeFilter)
      setOptionalQueryParam(params, 'member', memberFilter)
      setOptionalQueryParam(params, 'q', searchKeyword)
    })
  }, [cityFilter, eventTypeFilter, memberFilter, replaceQuery, searchKeyword, yearFilter])

  useEffect(() => {
    if (activities.length === 0) {
      setSelectedActivity(null)
      setIsPanelOpen(false)
      setTimelineCursorId(null)
      return
    }

    if (!activityParam) {
      setInvalidActivityParam(false)
      return
    }

    const matchedActivity = activitiesById.get(activityParam)

    if (!matchedActivity) {
      setInvalidActivityParam(true)
      setSelectedActivity(null)
      setIsPanelOpen(false)
      return
    }

    setInvalidActivityParam(false)

    if (!filteredActivityIdSet.has(matchedActivity.id)) {
      setSelectedActivity(null)
      setIsPanelOpen(false)
      updateActivityQuery(null)
      return
    }

    setTimelineCursorId(matchedActivity.id)
    setSelectedActivity((previous) => (previous?.id === matchedActivity.id ? previous : matchedActivity))
    setIsActivityListOpen(false)
    if (delayedPanelActivityIdRef.current !== matchedActivity.id) {
      setIsPanelOpen(true)
    }
  }, [activities.length, activitiesById, activityParam, filteredActivityIdSet, updateActivityQuery])

  useEffect(() => {
    if (!selectedActivity) {
      return
    }

    if (!filteredActivityIdSet.has(selectedActivity.id)) {
      handleClosePanel()
    }
  }, [filteredActivityIdSet, handleClosePanel, selectedActivity])

  useEffect(() => {
    if (!timelineCursorId || filteredActivityIdSet.has(timelineCursorId)) {
      return
    }

    if (sortedFilteredActivities.length === 0) {
      return
    }

    const previousCursorActivity = activitiesById.get(timelineCursorId)
    if (!previousCursorActivity) {
      setTimelineCursorId(sortedFilteredActivities[sortedFilteredActivities.length - 1].id)
      return
    }

    const previousTimestamp = Date.parse(`${previousCursorActivity.date}T00:00:00+08:00`)
    let nearestActivity = sortedFilteredActivities[0]
    let nearestDistance = Math.abs(
      Date.parse(`${nearestActivity.date}T00:00:00+08:00`) - previousTimestamp
    )

    sortedFilteredActivities.slice(1).forEach((activity) => {
      const distance = Math.abs(
        Date.parse(`${activity.date}T00:00:00+08:00`) - previousTimestamp
      )
      if (distance < nearestDistance) {
        nearestActivity = activity
        nearestDistance = distance
      }
    })

    setTimelineCursorId(nearestActivity.id)
  }, [activitiesById, filteredActivityIdSet, sortedFilteredActivities, timelineCursorId])

  const isActivityListVisible = isActivityListOpen && !isPanelOpen
  const shouldUseCompactNoticeTop = isPanelOpen || isFilterHidden || isFilterCollapsed
  const selectedTimelineIndex = selectedActivity
    ? sortedFilteredActivities.findIndex((activity) => activity.id === selectedActivity.id)
    : -1
  const previousDetailActivity =
    selectedTimelineIndex > 0 ? sortedFilteredActivities[selectedTimelineIndex - 1] : null
  const nextDetailActivity =
    selectedTimelineIndex >= 0 && selectedTimelineIndex < sortedFilteredActivities.length - 1
      ? sortedFilteredActivities[selectedTimelineIndex + 1]
      : null

  return (
    <div className="relative h-full w-full">
      {isPanelOpen ? null : (
        <ActivityFilterBar
          searchKeyword={searchKeyword}
          onSearchKeywordChange={setSearchKeyword}
          cityFilter={cityFilter}
          cityOptions={cityOptions}
          onCityFilterChange={setCityFilter}
          yearFilter={yearFilter}
          yearOptions={yearOptions}
          onYearFilterChange={setYearFilter}
          eventTypeFilter={eventTypeFilter}
          eventTypeOptions={eventTypeOptions}
          onEventTypeFilterChange={setEventTypeFilter}
          memberFilter={memberFilter}
          memberOptions={memberOptions}
          onMemberFilterChange={setMemberFilter}
          onClearFilters={handleClearFilters}
          isClearDisabled={!hasActiveCriteria}
          resultCount={filteredActivities.length}
          totalCount={activities.length}
          activeCriteriaCount={activeCriteriaCount}
          isCollapsed={isFilterCollapsed}
          isHidden={isFilterHidden}
          onToggleCollapsed={handleToggleFilterCollapsed}
          onHide={handleHideFilterBar}
          onShow={handleShowFilterBar}
        />
      )}

      {invalidActivityParam ? <InvalidQueryNotice compactTop={shouldUseCompactNoticeTop} /> : null}

      <AmapViewport
        activities={filteredActivities}
        selectedActivity={selectedActivity}
        selectedActivityId={selectedActivityId}
        fitAllRequest={fitAllRequest}
        focusSelectedRequest={focusSelectedRequest}
        onSelect={handleSelectActivity}
      />

      <MemoryTimeline
        activities={filteredActivities}
        totalCount={activities.length}
        cursorActivityId={timelineCursorId}
        selectedActivityId={selectedActivityId}
        isDetailOpen={isPanelOpen}
        isListOpen={isActivityListVisible}
        hasActiveCriteria={hasActiveCriteria}
        onCursorChange={setTimelineCursorId}
        onSelect={handleSelectTimelineActivity}
        onResetAll={handleResetTimeline}
        onClearFilters={handleClearFilters}
        onFocusCurrent={handleFocusSelectedActivity}
        onToggleList={handleToggleActivityList}
      />

      <ActivityResultList
        activities={filteredActivities}
        selectedActivityId={selectedActivityId}
        isOpen={isActivityListVisible}
        onClose={handleCloseActivityList}
        onSelect={handleSelectActivityFromList}
      />

      <ActivityDetailPanel
        activity={selectedActivity}
        isOpen={isPanelOpen}
        onClose={handleClosePanel}
        timelineNavigation={
          selectedTimelineIndex >= 0
            ? {
                currentIndex: selectedTimelineIndex + 1,
                totalCount: sortedFilteredActivities.length,
                previousActivity: previousDetailActivity,
                nextActivity: nextDetailActivity,
                onSelect: handleSelectAdjacentActivity,
                onFocusCurrent: handleFocusSelectedActivity,
              }
            : undefined
        }
      />

      {activities.length === 0 ? (
        <NoticeOverlay title="暂无活动数据" description="请先补充活动数据后再查看地图。" />
      ) : null}

      {activities.length > 0 && filteredActivities.length === 0 ? (
        <NoticeOverlay
          title="没有匹配的活动"
          description={
            hasActiveCriteria
              ? '当前筛选或搜索条件下暂无结果，试试清空筛选。'
              : '当前暂无可展示的活动。'
          }
        />
      ) : null}
    </div>
  )
}
