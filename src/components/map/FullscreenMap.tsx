'use client'

import { memo, startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { MapContainer, TileLayer, ZoomControl, useMap } from 'react-leaflet'
import ActivityFilterBar from '@/components/filters/ActivityFilterBar'
import ActivityResultList from '@/components/map/ActivityResultList'
import MapActionBar from '@/components/map/MapActionBar'
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
    <div className="pointer-events-none absolute inset-x-0 bottom-6 z-[420] flex justify-center px-4">
      <div className="pointer-events-auto w-full max-w-xl rounded-xl border border-slate-300/90 bg-slate-50/95 px-4 py-3 text-center shadow-md backdrop-blur-md">
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <p className="mt-1 text-xs text-slate-600">{description}</p>
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
      <div className="pointer-events-auto rounded-lg border border-amber-300 bg-amber-50/95 px-3 py-2 text-xs text-amber-800 shadow-sm backdrop-blur-md">
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
  const [fitAllRequest, setFitAllRequest] = useState(0)
  const [focusSelectedRequest, setFocusSelectedRequest] = useState(0)
  const activityQueryFrameRef = useRef<number | null>(null)

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
    },
    []
  )

  const handleSelectActivity = useCallback(
    (activity: Activity) => {
      setSelectedActivity(activity)
      setIsPanelOpen(true)
      setInvalidActivityParam(false)
      if (window.matchMedia(MOBILE_VIEWPORT_QUERY).matches) {
        setIsFilterCollapsed(true)
      }
      updateActivityQuery(activity.id)
    },
    [updateActivityQuery]
  )

  const handleClosePanel = useCallback(() => {
    setSelectedActivity(null)
    setIsPanelOpen(false)
    setInvalidActivityParam(false)
    updateActivityQuery(null)
  }, [updateActivityQuery])

  const handleFitAllActivities = useCallback(() => {
    setFitAllRequest((value) => value + 1)
  }, [])

  const handleFocusSelectedActivity = useCallback(() => {
    setFocusSelectedRequest((value) => value + 1)
  }, [])

  const handleToggleActivityList = useCallback(() => {
    setIsActivityListOpen((value) => !value)
  }, [])

  const handleCloseActivityList = useCallback(() => {
    setIsActivityListOpen(false)
  }, [])

  const handleSelectActivityFromList = useCallback(
    (activity: Activity) => {
      handleSelectActivity(activity)
      setIsActivityListOpen(false)
    },
    [handleSelectActivity]
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
  }, [])

  const handleHideFilterBar = useCallback(() => {
    setIsFilterHidden(true)
  }, [])

  const handleShowFilterBar = useCallback(() => {
    setIsFilterHidden(false)
  }, [])

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

    setSelectedActivity((previous) => (previous?.id === matchedActivity.id ? previous : matchedActivity))
    setIsPanelOpen(true)
  }, [activities.length, activitiesById, activityParam, filteredActivityIdSet, updateActivityQuery])

  useEffect(() => {
    if (!selectedActivity) {
      return
    }

    if (!filteredActivityIdSet.has(selectedActivity.id)) {
      handleClosePanel()
    }
  }, [filteredActivityIdSet, handleClosePanel, selectedActivity])

  const shouldUseCompactNoticeTop = isFilterHidden || isFilterCollapsed

  return (
    <div className="relative h-full w-full">
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

      {invalidActivityParam ? <InvalidQueryNotice compactTop={shouldUseCompactNoticeTop} /> : null}

      <AmapViewport
        activities={filteredActivities}
        selectedActivity={selectedActivity}
        selectedActivityId={selectedActivityId}
        fitAllRequest={fitAllRequest}
        focusSelectedRequest={focusSelectedRequest}
        onSelect={handleSelectActivity}
      />

      <MapActionBar
        canFocusSelected={Boolean(selectedActivity)}
        canCloseDetail={isPanelOpen}
        hasActivities={filteredActivities.length > 0}
        isDetailOpen={isPanelOpen}
        isListOpen={isActivityListOpen}
        onFitAll={handleFitAllActivities}
        onFocusSelected={handleFocusSelectedActivity}
        onCloseDetail={handleClosePanel}
        onToggleList={handleToggleActivityList}
      />

      <ActivityResultList
        activities={filteredActivities}
        selectedActivityId={selectedActivityId}
        isOpen={isActivityListOpen}
        onClose={handleCloseActivityList}
        onSelect={handleSelectActivityFromList}
      />

      <ActivityDetailPanel
        activity={selectedActivity}
        isOpen={isPanelOpen}
        onClose={handleClosePanel}
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
