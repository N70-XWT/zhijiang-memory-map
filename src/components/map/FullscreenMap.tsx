'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import ActivityFilterBar from '@/components/filters/ActivityFilterBar'
import ActivityResultList from './ActivityResultList'
import MemoryTimeline from './MemoryTimeline'
import ActivityDetailPanel from '@/components/panel/ActivityDetailPanel'
import AmapViewport from './AmapViewport'
import {
  selectionReducer,
  type SelectionSource,
  type SelectionState,
} from '@/lib/mapSelection'
import { useMapInsets } from '@/components/hooks/useMapInsets'
import { useActivityLift } from '@/components/hooks/useActivityLift'
import { usePressFeedback } from '@/components/hooks/usePressFeedback'
import { emptyFilters, hasActiveFilters, matchesActivity, readFilters, toggleFilterValue, writeFilters, type FilterKey, type Filters } from '@/lib/activityFilters'
import type { Activity } from '@/types/activity'

export default function FullscreenMap({
  activities,
}: {
  activities: Activity[]
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const query = searchParams.toString()
  const options = useMemo(
    () => ({
      city: [...new Set(activities.map((a) => a.city))].sort(),
      year: [...new Set(activities.map((a) => String(a.year)))]
        .sort()
        .reverse(),
      type: [...new Set(activities.map((a) => a.eventType))].sort(),
      member: [...new Set(activities.flatMap((a) => a.members))].sort(),
    }),
    [activities],
  )
  const [filters, setFilters] = useState(() =>
    readFilters(new URLSearchParams(query), options),
  )
  const [selection, dispatch] = useReducer(
    selectionReducer,
    null,
    (): SelectionState => {
      const id = new URLSearchParams(query).get('activity')
      const valid = activities.some((a) => a.id === id && matchesActivity(a, filters))
      return {
        activityId: valid ? id : null,
        panel: valid ? 'detail' : 'closed',
        source: 'url',
        revision: 0,
        returnToList: false,
      }
    },
  )
  const [sheet, setSheet] = useState<'summary' | 'half' | 'full'>('half')
  const [isDesktop, setIsDesktop] = useState(false)
  const [fitAllRequest, setFitAllRequest] = useState(0)
  const [focusRequest, setFocusRequest] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const liftActivity = useActivityLift(root)
  usePressFeedback(root)
  const lastWritten = useRef(query)
  const pendingUrl = useRef<ReturnType<typeof setTimeout> | null>(null)
  const localChange = useRef(false)
  const [urlRevision, setUrlRevision] = useState(0)
  const [invalidQuery, setInvalidQuery] = useState(
    () =>
      Boolean(searchParams.get('activity')) &&
      !activities.some((a) => a.id === searchParams.get('activity')),
  )

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)')
    const update = () => setIsDesktop(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  const filtered = useMemo(
    () => activities.filter((a) => matchesActivity(a, filters)),
    [activities, filters],
  )
  const sorted = useMemo(
    () =>
      [...filtered].sort(
        (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
      ),
    [filtered],
  )
  const selected = activities.find((a) => a.id === selection.activityId) ?? null
  const index = sorted.findIndex((a) => a.id === selection.activityId)
  const panelOpen = selection.panel === 'detail'
  const insets = useMapInsets(
    root,
    `${selection.panel}-${sheet}-${isDesktop}-${JSON.stringify(filters)}`,
  )

  // Only external URL changes restore/open a panel. Our own writes must not reopen a closed sheet.
  useEffect(() => {
    if (query === lastWritten.current) return
    if (pendingUrl.current) clearTimeout(pendingUrl.current)
    localChange.current = false
    lastWritten.current = query
    const params = new URLSearchParams(query)
    const next = readFilters(params, options)
    const id = params.get('activity')
    setFilters(next)
    dispatch({
      type: 'restore',
      id: activities.some((a) => a.id === id && matchesActivity(a, next)) ? id : null,
    })
    setInvalidQuery(Boolean(id) && !activities.some((a) => a.id === id))
    setSheet('half')
    setFitAllRequest((v) => v + 1)
  }, [query, activities, options])

  useEffect(() => {
    if (!localChange.current) return
    if (pendingUrl.current) clearTimeout(pendingUrl.current)
    pendingUrl.current = setTimeout(
      () => {
        const params = new URLSearchParams(window.location.search)
        writeFilters(params, filters)
        if (selection.activityId) params.set('activity', selection.activityId)
        else params.delete('activity')
        lastWritten.current = params.toString()
        window.history.replaceState(
          window.history.state,
          '',
          `${pathname}${lastWritten.current ? `?${lastWritten.current}` : ''}`,
        )
        pendingUrl.current = null
      },
      JSON.stringify(filters) !== JSON.stringify(readFilters(new URLSearchParams(lastWritten.current), options)) ? 250 : 0,
    )
    return () => {
      if (pendingUrl.current) clearTimeout(pendingUrl.current)
    }
  }, [
    filters,
    selection.activityId,
    selection.revision,
    selection.source,
    pathname,
    options,
    urlRevision,
  ])

  const applyFilters = (next: Filters) => {
    localChange.current = true
    setFilters(next)
    dispatch({
      type: 'filter',
      validIds: activities.filter((a) => matchesActivity(a, next)).map((a) => a.id),
    })
    setFitAllRequest((v) => v + 1)
    setInvalidQuery(false)
  }
  const toggleFilter = (key: FilterKey, value: string) =>
    applyFilters({ ...filters, [key]: toggleFilterValue(filters[key], value, options[key]) })
  const clearFilters = () => {
    localChange.current = true
    setFilters(emptyFilters)
    setFitAllRequest((v) => v + 1)
  }
  const select = useCallback(
    (activity: Activity, source: SelectionSource) => {
      localChange.current = true
      dispatch({ type: 'select', id: activity.id, source })
      setInvalidQuery(false)
      if (selection.panel !== 'detail' && source !== 'scroll') setSheet('half')
      setFocusRequest((v) => v + 1)
    },
    [selection.panel],
  )
  const reset = () => {
    localChange.current = true
    dispatch({ type: 'reset' })
    setFitAllRequest((v) => v + 1)
    setInvalidQuery(false)
    setUrlRevision((v) => v + 1)
  }
  const fullscreen = !isDesktop && panelOpen && sheet === 'full'
  const hasCriteria = hasActiveFilters(filters)
  return (
    <div ref={root} className="memory-map relative h-full w-full">
      <div
        className="absolute inset-0"
        inert={fullscreen}
        aria-hidden={fullscreen}
      >
        <AmapViewport
          activities={filtered}
          selectedActivity={selected}
          selectedActivityId={selection.activityId}
          viewportInsets={insets}
          fitAllRequest={fitAllRequest}
          focusSelectedRequest={focusRequest}
          onSelect={(a) => select(a, 'marker')}
        />
      </div>
      <ActivityFilterBar
        filters={filters}
        options={options}
        onSearch={(value) => applyFilters({ ...filters, q: value })}
        onToggle={toggleFilter}
        onClear={clearFilters}
        count={filtered.length}
        total={activities.length}
        panelOpen={selection.panel !== 'closed'}
        hidden={fullscreen}
      />
      <div
        inert={fullscreen}
        aria-hidden={fullscreen}
      >
        <MemoryTimeline
          activities={filtered}
          totalCount={activities.length}
          cursorActivityId={selection.activityId}
          selectedActivityId={selection.activityId}
          isDetailOpen={panelOpen}
          isListOpen={selection.panel === 'list'}
          hasActiveCriteria={hasCriteria}
          onCursorChange={(id) => {
            const a = activities.find((a) => a.id === id)
            if (a) select(a, 'scroll')
          }}
          onSelect={(a) => select(a, 'timeline')}
          onResetAll={reset}
          onClearFilters={clearFilters}
          onFocusCurrent={() => {
            if (selected && !panelOpen) select(selected, 'timeline')
            else setFocusRequest((v) => v + 1)
          }}
          onToggleList={() => {
            dispatch({ type: 'list' })
          }}
        />
      </div>
      <ActivityResultList
        isDesktop={isDesktop}
        activities={filtered}
        selectedActivityId={selection.activityId}
        isOpen={selection.panel === 'list'}
        onClose={() => dispatch({ type: 'close' })}
        onSelect={(a) => liftActivity(a.id, () => select(a, 'list'))}
        onClearFilters={clearFilters}
      />
      <ActivityDetailPanel
        activity={selected}
        isOpen={panelOpen}
        isDesktop={isDesktop}
        sheet={sheet}
        onSheetChange={setSheet}
        onClose={() => dispatch({ type: 'close' })}
        onBackToList={
          selection.returnToList && selected
            ? () => liftActivity(selected.id, () => dispatch({ type: 'list' }))
            : undefined
        }
        timelineNavigation={
          index >= 0
            ? {
                currentIndex: index + 1,
                totalCount: sorted.length,
                previousActivity: sorted[index - 1] ?? null,
                nextActivity: sorted[index + 1] ?? null,
                onSelect: (a) => select(a, 'adjacent'),
                onFocusCurrent: () => setFocusRequest((v) => v + 1),
              }
            : undefined
        }
      />
      {invalidQuery && (
        <p role="status" className="map-notice">
          链接中的活动不存在，已显示全部可用回忆。
        </p>
      )}
      {!filtered.length && (
        <div role="status" className="map-notice">
          <p>{activities.length ? '没有匹配的活动' : '暂无活动数据'}</p>
          {hasCriteria && (
            <button className="memory-button mt-2" onClick={clearFilters}>
              清空筛选
            </button>
          )}
        </div>
      )}
    </div>
  )
}
