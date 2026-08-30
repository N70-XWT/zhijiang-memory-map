'use client'

import Image from 'next/image'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type WheelEvent,
} from 'react'
import UiIcon from '@/components/common/UiIcon'
import type { Activity } from '@/types/activity'

type TimelineGroup = {
  date: string
  timestamp: number
  year: number
  gapFromPrevious: number
  activities: Activity[]
}

type TimelinePreviewState = {
  activity: Activity
  groupSize: number
  left: number
}

type MemoryTimelineProps = {
  activities: Activity[]
  totalCount: number
  cursorActivityId: string | null
  selectedActivityId: string | null
  isDetailOpen: boolean
  isListOpen: boolean
  hasActiveCriteria: boolean
  onCursorChange: (activityId: string) => void
  onSelect: (activity: Activity) => void
  onResetAll: () => void
  onClearFilters: () => void
  onFocusCurrent: () => void
  onToggleList: () => void
}

type TimelineRailProps = {
  groups: TimelineGroup[]
  cursorActivityId: string | null
  selectedActivityId: string | null
  openGroupDate: string | null
  isDragging: boolean
  scrollRef: RefObject<HTMLDivElement | null>
  pickerId: string
  onCursorChange: (activityId: string) => void
  onSelect: (activity: Activity) => void
  onToggleGroup: (date: string) => void
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>, activity: Activity) => void
  onScroll: (scroller: HTMLDivElement) => void
  onWheel: (event: WheelEvent<HTMLDivElement>) => void
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void
  shouldSuppressNodeClick: () => boolean
  onPreviewChange: (
    activity: Activity | null,
    groupSize?: number,
    anchor?: HTMLButtonElement
  ) => void
}

type GroupPickerProps = {
  id: string
  group: TimelineGroup | null
  onSelect: (activity: Activity) => void
}

const DAY_MS = 24 * 60 * 60 * 1000
const DRAG_THRESHOLD_PX = 6
const SCROLL_IDLE_MS = 120
const MIN_GROUP_GAP_PX = 48
const MAX_GROUP_GAP_PX = 112

const toTimestamp = (date: string) => Date.parse(`${date}T00:00:00+08:00`)

const sortActivities = (activities: Activity[]) =>
  [...activities].sort((left, right) => {
    const byDate = left.date.localeCompare(right.date)
    return byDate === 0 ? left.id.localeCompare(right.id) : byDate
  })

const getGroupGap = (previousTimestamp: number, timestamp: number, crossesYear: boolean) => {
  const gapDays = Math.max(1, Math.round((timestamp - previousTimestamp) / DAY_MS))
  const compressedGap = 48 + 24 * Math.log2(1 + gapDays / 14)
  const boundedGap = Math.min(MAX_GROUP_GAP_PX, Math.max(MIN_GROUP_GAP_PX, compressedGap))
  return Math.round(crossesYear ? Math.max(72, boundedGap) : boundedGap)
}

function buildTimelineGroups(activities: Activity[]): TimelineGroup[] {
  const groupsByDate = new Map<string, Activity[]>()

  sortActivities(activities).forEach((activity) => {
    const group = groupsByDate.get(activity.date)
    if (group) {
      group.push(activity)
      return
    }
    groupsByDate.set(activity.date, [activity])
  })

  let previousTimestamp: number | null = null
  let previousYear: number | null = null

  return Array.from(groupsByDate.entries()).map(([date, groupActivities]) => {
    const timestamp = toTimestamp(date)
    const year = groupActivities[0].year
    const gapFromPrevious =
      previousTimestamp === null
        ? 0
        : getGroupGap(previousTimestamp, timestamp, previousYear !== year)

    previousTimestamp = timestamp
    previousYear = year

    return {
      date,
      timestamp,
      year,
      gapFromPrevious,
      activities: groupActivities,
    }
  })
}

function formatDisplayDate(date: string) {
  const [, month, day] = date.split('-')
  return `${month}.${day}`
}

function GroupPicker({ id, group, onSelect }: GroupPickerProps) {
  if (!group) {
    return null
  }

  return (
    <div
      id={id}
      role="menu"
      aria-label={`${group.date} 的活动`}
      className="absolute bottom-[calc(100%+10px)] left-1/2 z-20 w-[min(340px,calc(100vw-1.5rem))] -translate-x-1/2 rounded-2xl border border-orange-200/80 bg-[#fffaf5] p-2 shadow-[0_18px_48px_rgba(124,45,18,0.2)] backdrop-blur-md transition duration-150 motion-reduce:transition-none"
    >
      <div className="mb-1.5 flex items-center justify-between px-2 py-1">
        <div>
          <p className="text-xs font-extrabold text-slate-950">{group.date}</p>
          <p className="text-[10px] font-medium text-slate-500">同日 {group.activities.length} 场活动</p>
        </div>
        <span className="rounded-full bg-blue-600 px-2 py-1 text-[10px] font-black text-white">
          {group.activities.length}
        </span>
      </div>
      <div className="grid gap-1.5">
        {group.activities.map((activity) => (
          <button
            key={activity.id}
            type="button"
            role="menuitem"
            onClick={() => onSelect(activity)}
            className="group flex min-h-11 items-center gap-2.5 rounded-xl border border-orange-100 bg-white px-3 py-2 text-left transition duration-150 hover:border-orange-300 hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-800">
              <UiIcon name="pin" className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-extrabold text-slate-950">{activity.city}</span>
              <span className="block truncate text-[10px] font-medium text-slate-500">
                {activity.title}
              </span>
            </span>
            <UiIcon name="arrow" className="h-4 w-4 shrink-0 text-blue-600" />
          </button>
        ))}
      </div>
    </div>
  )
}

function TimelineHoverPreview({ preview }: { preview: TimelinePreviewState | null }) {
  if (!preview) {
    return null
  }

  const { activity, groupSize, left } = preview

  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute bottom-[calc(100%+10px)] z-30 w-[292px] -translate-x-1/2 rounded-2xl border border-orange-200/80 bg-[#fffaf5] p-2.5 shadow-[0_16px_42px_rgba(124,45,18,0.18)] backdrop-blur-md"
      style={{ left }}
    >
      <div className="flex items-center gap-3">
        <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-[18px] border-[3px] border-white bg-[#FC966E] shadow-[0_6px_16px_rgba(15,23,42,0.16)]">
          <Image
            src={activity.markerThumbnail}
            alt=""
            fill
            sizes="56px"
            unoptimized
            className="object-cover"
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="mb-1 flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
            <span>{activity.date}</span>
            <span aria-hidden="true">·</span>
            <span>{activity.city}</span>
            {groupSize > 1 ? (
              <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[9px] font-black text-white">
                同日 {groupSize} 场
              </span>
            ) : null}
          </span>
          <span className="line-clamp-2 text-xs font-extrabold leading-4 text-slate-950">
            {activity.title}
          </span>
          <span className="mt-1 block text-[10px] font-semibold text-orange-700">
            点击节点定位活动
          </span>
        </span>
      </div>
      <span className="absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-b border-r border-orange-200/80 bg-[#fffaf5]" />
    </div>
  )
}

function TimelineRail({
  groups,
  cursorActivityId,
  selectedActivityId,
  openGroupDate,
  isDragging,
  scrollRef,
  pickerId,
  onCursorChange,
  onSelect,
  onToggleGroup,
  onKeyDown,
  onScroll,
  onWheel,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  shouldSuppressNodeClick,
  onPreviewChange,
}: TimelineRailProps) {
  const cursorGroup = groups.find((group) =>
    group.activities.some((activity) => activity.id === cursorActivityId)
  )

  const activateGroup = (group: TimelineGroup) => {
    const focusedActivity =
      group.activities.find((activity) => activity.id === cursorActivityId) ??
      group.activities[0]

    if (group.activities.length > 1) {
      onCursorChange(focusedActivity.id)
      onToggleGroup(group.date)
      return
    }

    onSelect(focusedActivity)
  }

  if (groups.length === 0) {
    return (
      <div className="flex h-12 flex-1 items-center justify-center px-4 text-center text-xs font-bold text-slate-500">
        没有符合条件的回忆
      </div>
    )
  }

  return (
    <div
      ref={scrollRef}
      className={`memory-timeline-scrollbar relative h-14 min-w-0 flex-1 overflow-x-auto overflow-y-hidden overscroll-x-contain px-8 [scroll-snap-type:x_mandatory] [touch-action:pan-x] ${
        isDragging ? 'cursor-grabbing select-none [scroll-snap-type:none]' : 'cursor-grab'
      }`}
      onScroll={(event) => onScroll(event.currentTarget)}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className="relative flex h-full min-w-max items-end pb-0.5">
        <span className="pointer-events-none absolute bottom-[21px] left-0 right-0 h-0.5 rounded-full bg-orange-200" />

        {groups.map((group, groupIndex) => {
          const isCursorGroup = cursorGroup?.date === group.date
          const isSelectedGroup = group.activities.some(
            (activity) => activity.id === selectedActivityId
          )
          const isMultiActivity = group.activities.length > 1
          const showYear = groupIndex === 0 || groups[groupIndex - 1].year !== group.year
          const fallbackCursor = cursorActivityId === null && groupIndex === groups.length - 1
          const previewActivity =
            group.activities.find((activity) => activity.id === cursorActivityId) ??
            group.activities[0]
          const groupLabel = isMultiActivity
            ? `${group.date}，同日 ${group.activities.length} 场活动`
            : `${group.date}，${group.activities[0].city}，${group.activities[0].title}`

          return (
            <div
              key={group.date}
              data-timeline-group={group.date}
              className="relative flex h-full w-11 shrink-0 snap-center flex-col items-center justify-end"
              style={{ marginLeft: groupIndex === 0 ? 0 : Math.max(4, group.gapFromPrevious - 44) }}
            >
              {showYear ? (
                <span className="pointer-events-none absolute top-0 whitespace-nowrap text-[9px] font-black tracking-[0.12em] text-orange-700">
                  {group.year}
                </span>
              ) : null}

              <button
                type="button"
                data-timeline-node={group.date}
                aria-label={groupLabel}
                aria-current={isSelectedGroup ? 'true' : undefined}
                aria-expanded={isMultiActivity ? openGroupDate === group.date : undefined}
                aria-haspopup={isMultiActivity ? 'menu' : undefined}
                aria-controls={
                  isMultiActivity && openGroupDate === group.date
                    ? pickerId
                    : undefined
                }
                tabIndex={isCursorGroup || fallbackCursor ? 0 : -1}
                onMouseEnter={(event) =>
                  onPreviewChange(previewActivity, group.activities.length, event.currentTarget)
                }
                onMouseLeave={() => onPreviewChange(null)}
                onFocus={(event) =>
                  onPreviewChange(previewActivity, group.activities.length, event.currentTarget)
                }
                onBlur={() => onPreviewChange(null)}
                onKeyDown={(event) => {
                  const focusedActivity =
                    group.activities.find((activity) => activity.id === cursorActivityId) ??
                    group.activities[0]
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    activateGroup(group)
                    return
                  }
                  onKeyDown(event, focusedActivity)
                }}
                onClick={() => {
                  if (shouldSuppressNodeClick()) {
                    return
                  }
                  activateGroup(group)
                }}
                className="group relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#fffaf5]"
              >
                <span
                  className={`relative flex items-center justify-center rounded-full border-2 border-[#fffaf5] font-black shadow-sm transition-[width,height,background-color,box-shadow,transform] duration-150 ease-out motion-reduce:transition-none ${
                    isSelectedGroup
                      ? 'h-[22px] w-[22px] bg-blue-600 text-white shadow-[0_0_0_4px_rgba(37,99,235,0.16)]'
                      : isCursorGroup
                        ? 'h-[18px] w-[18px] bg-[#FC966E] text-white shadow-[0_0_0_3px_rgba(252,150,110,0.18)]'
                        : 'h-3 w-3 bg-[#FC966E] text-transparent group-hover:scale-125'
                  } ${isMultiActivity ? 'h-7 min-w-7 px-1.5 text-[10px] text-white' : ''}`}
                >
                  {isMultiActivity ? group.activities.length : ''}
                </span>
              </button>

              {isCursorGroup ? (
                <span className="pointer-events-none absolute bottom-0 translate-y-full whitespace-nowrap pt-0.5 text-[9px] font-extrabold text-slate-600">
                  {formatDisplayDate(group.date)}
                </span>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function MemoryTimeline({
  activities,
  totalCount,
  cursorActivityId,
  selectedActivityId,
  isDetailOpen,
  isListOpen,
  hasActiveCriteria,
  onCursorChange,
  onSelect,
  onResetAll,
  onClearFilters,
  onFocusCurrent,
  onToggleList,
}: MemoryTimelineProps) {
  const groups = useMemo(() => buildTimelineGroups(activities), [activities])
  const sortedActivities = useMemo(() => sortActivities(activities), [activities])
  const [openGroupDate, setOpenGroupDate] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [previewState, setPreviewState] = useState<TimelinePreviewState | null>(null)
  const desktopRootRef = useRef<HTMLDivElement | null>(null)
  const mobileRootRef = useRef<HTMLDivElement | null>(null)
  const desktopScrollRef = useRef<HTMLDivElement | null>(null)
  const mobileScrollRef = useRef<HTMLDivElement | null>(null)
  const scrollIdleTimeoutRef = useRef<number | null>(null)
  const programmaticScrollersRef = useRef(new Set<HTMLDivElement>())
  const suppressNodeClickRef = useRef(false)
  const dragStateRef = useRef<{
    pointerId: number
    startX: number
    startScrollLeft: number
    scroller: HTMLDivElement
    moved: boolean
  } | null>(null)

  const cursorIndex = sortedActivities.findIndex((activity) => activity.id === cursorActivityId)
  const cursorActivity = cursorIndex >= 0 ? sortedActivities[cursorIndex] : null
  const selectedActivity = sortedActivities.find((activity) => activity.id === selectedActivityId) ?? null
  const currentIndex = cursorIndex >= 0 ? cursorIndex : sortedActivities.length - 1
  const previousActivity =
    sortedActivities.length === 0
      ? null
      : currentIndex > 0
        ? sortedActivities[currentIndex - 1]
        : cursorActivity
          ? null
          : sortedActivities[sortedActivities.length - 1]
  const nextActivity =
    sortedActivities.length === 0
      ? null
      : cursorIndex < 0
        ? sortedActivities[0]
        : currentIndex < sortedActivities.length - 1
          ? sortedActivities[currentIndex + 1]
          : null
  const openGroup = groups.find((group) => group.date === openGroupDate) ?? null
  const currentPosition = cursorIndex >= 0 ? cursorIndex + 1 : null

  const scrollGroupIntoView = useCallback((activityId: string, focusNode = false) => {
    const group = groups.find((candidate) =>
      candidate.activities.some((activity) => activity.id === activityId)
    )
    if (!group) {
      return
    }

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ;[desktopScrollRef.current, mobileScrollRef.current].forEach((scroller) => {
      if (!scroller || scroller.offsetParent === null) {
        return
      }
      const node = scroller.querySelector<HTMLElement>(`[data-timeline-group="${group.date}"]`)
      if (!node) {
        return
      }
      programmaticScrollersRef.current.add(scroller)
      const targetLeft = node.offsetLeft - (scroller.clientWidth - node.offsetWidth) / 2
      scroller.scrollTo({
        left: Math.max(0, targetLeft),
        behavior: reduceMotion ? 'auto' : 'smooth',
      })
      if (focusNode && scroller.offsetParent !== null) {
        window.requestAnimationFrame(() => {
          node.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true })
        })
      }
    })
  }, [groups])

  useEffect(() => {
    if (cursorActivityId) {
      scrollGroupIntoView(cursorActivityId)
    }
  }, [cursorActivityId, scrollGroupIntoView])

  useEffect(() => {
    setOpenGroupDate((current) =>
      current && groups.some((group) => group.date === current) ? current : null
    )
  }, [groups])

  useEffect(() => {
    const handleOutsidePointer = (event: PointerEvent) => {
      const target = event.target as Node
      if (
        desktopRootRef.current?.contains(target) ||
        mobileRootRef.current?.contains(target)
      ) {
        return
      }
      setOpenGroupDate(null)
    }

    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenGroupDate(null)
      }
    }

    document.addEventListener('pointerdown', handleOutsidePointer)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('pointerdown', handleOutsidePointer)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [])

  useEffect(
    () => () => {
      if (scrollIdleTimeoutRef.current !== null) {
        window.clearTimeout(scrollIdleTimeoutRef.current)
      }
    },
    []
  )

  const handleScroll = useCallback(
    (scroller: HTMLDivElement) => {
      if (scrollIdleTimeoutRef.current !== null) {
        window.clearTimeout(scrollIdleTimeoutRef.current)
      }
      scrollIdleTimeoutRef.current = window.setTimeout(() => {
        if (programmaticScrollersRef.current.has(scroller)) {
          programmaticScrollersRef.current.delete(scroller)
          return
        }
        const center = scroller.scrollLeft + scroller.clientWidth / 2
        const nodes = Array.from(
          scroller.querySelectorAll<HTMLElement>('[data-timeline-group]')
        )
        let closestNode: HTMLElement | null = null
        let closestDistance = Number.POSITIVE_INFINITY

        for (const node of nodes) {
          const nodeCenter = node.offsetLeft + node.offsetWidth / 2
          const distance = Math.abs(nodeCenter - center)
          if (distance < closestDistance) {
            closestDistance = distance
            closestNode = node
          }
        }

        const date = closestNode?.dataset.timelineGroup
        const group = groups.find((candidate) => candidate.date === date)
        if (!group) {
          return
        }
        const nextCursor =
          group.activities.find((activity) => activity.id === cursorActivityId) ??
          group.activities[0]
        onCursorChange(nextCursor.id)
      }, SCROLL_IDLE_MS)
    },
    [cursorActivityId, groups, onCursorChange]
  )

  const handleWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX
    if (delta === 0) {
      return
    }
    setPreviewState(null)
    event.preventDefault()
    event.currentTarget.scrollLeft += delta
  }, [])

  const handlePointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== 'mouse' || event.button !== 0) {
      return
    }

    const target = event.target
    if (target instanceof Element && target.closest('button')) {
      suppressNodeClickRef.current = false
      return
    }

    setPreviewState(null)
    suppressNodeClickRef.current = false
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: event.currentTarget.scrollLeft,
      scroller: event.currentTarget,
      moved: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }, [])

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return
    }
    const deltaX = event.clientX - dragState.startX
    if (!dragState.moved && Math.abs(deltaX) > DRAG_THRESHOLD_PX) {
      dragState.moved = true
      suppressNodeClickRef.current = true
      setIsDragging(true)
    }
    if (dragState.moved) {
      event.preventDefault()
      dragState.scroller.scrollLeft = dragState.startScrollLeft - deltaX
    }
  }, [])

  const handlePointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    dragStateRef.current = null
    window.setTimeout(() => {
      suppressNodeClickRef.current = false
      setIsDragging(false)
    }, 0)
  }, [])

  const shouldSuppressNodeClick = useCallback(
    () => suppressNodeClickRef.current,
    []
  )

  const handlePreviewChange = useCallback(
    (activity: Activity | null, groupSize = 1, anchor?: HTMLButtonElement) => {
      const root = desktopRootRef.current
      if (!activity || !anchor || !root || root.offsetParent === null || isDragging) {
        setPreviewState(null)
        return
      }

      const rootRect = root.getBoundingClientRect()
      const anchorRect = anchor.getBoundingClientRect()
      const desiredLeft = anchorRect.left + anchorRect.width / 2 - rootRect.left
      const left = Math.min(rootRect.width - 154, Math.max(154, desiredLeft))
      setPreviewState({ activity, groupSize, left })
    },
    [isDragging]
  )

  const moveCursor = useCallback(
    (nextIndex: number, focusNode: boolean) => {
      const nextActivity = sortedActivities[nextIndex]
      if (!nextActivity) {
        return
      }
      onCursorChange(nextActivity.id)
      scrollGroupIntoView(nextActivity.id, focusNode)
    },
    [onCursorChange, scrollGroupIntoView, sortedActivities]
  )

  const handleNodeKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, activity: Activity) => {
      const activityIndex = sortedActivities.findIndex((candidate) => candidate.id === activity.id)
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        moveCursor(Math.max(0, activityIndex - 1), true)
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        moveCursor(Math.min(sortedActivities.length - 1, activityIndex + 1), true)
      } else if (event.key === 'Home') {
        event.preventDefault()
        moveCursor(0, true)
      } else if (event.key === 'End') {
        event.preventDefault()
        moveCursor(sortedActivities.length - 1, true)
      } else if (event.key === 'Escape') {
        setOpenGroupDate(null)
      }
    },
    [moveCursor, sortedActivities]
  )

  const handleSelect = useCallback(
    (activity: Activity) => {
      setPreviewState(null)
      setOpenGroupDate(null)
      onCursorChange(activity.id)
      onSelect(activity)
    },
    [onCursorChange, onSelect]
  )

  const handleCurrentSummary = () => {
    if (!cursorActivity) {
      return
    }
    if (selectedActivity?.id === cursorActivity.id) {
      onFocusCurrent()
      return
    }
    handleSelect(cursorActivity)
  }

  const sharedRailProps = {
    groups,
    cursorActivityId,
    selectedActivityId,
    openGroupDate,
    isDragging,
    onCursorChange,
    onSelect: handleSelect,
    onToggleGroup: (date: string) => {
      setPreviewState(null)
      setOpenGroupDate((current) => (current === date ? null : date))
    },
    onKeyDown: handleNodeKeyDown,
    onScroll: handleScroll,
    onWheel: handleWheel,
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
    shouldSuppressNodeClick,
    onPreviewChange: handlePreviewChange,
  }

  const listButtonClassName = isListOpen
    ? 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700'
    : 'border-orange-100 bg-white text-slate-700 hover:border-orange-300 hover:bg-orange-50'

  return (
    <>
      <div
        ref={desktopRootRef}
        className={`pointer-events-auto absolute bottom-4 z-[410] hidden items-center rounded-[22px] border border-orange-200/80 bg-[#fffaf5]/95 shadow-[0_16px_44px_rgba(124,45,18,0.14)] backdrop-blur-md transition-[left,right,height,max-width] duration-300 motion-reduce:transition-none md:flex ${
          isDetailOpen
            ? 'left-[460px] right-5 h-[72px] max-w-none'
            : 'left-5 right-5 mx-auto h-[84px] max-w-[1180px]'
        }`}
        aria-label="活动时光轨道"
      >
        <div className="flex h-full w-[180px] shrink-0 items-center gap-2 border-r border-orange-100 px-3">
          <button
            type="button"
            onClick={onResetAll}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-orange-100 bg-white text-orange-700 transition hover:border-orange-300 hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
            aria-label="回到全部活动"
          >
            <UiIcon name="expand" className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleCurrentSummary}
            disabled={!cursorActivity}
            className="min-w-0 flex-1 rounded-xl px-1.5 py-1 text-left transition hover:bg-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-default"
          >
            <span className="block truncate text-xs font-extrabold text-slate-950">
              {cursorActivity ? cursorActivity.date : '全部回忆'}
            </span>
            <span className="block truncate text-[10px] font-semibold text-slate-500">
              {cursorActivity && currentPosition
                ? `${cursorActivity.city} · ${currentPosition} / ${sortedActivities.length}`
                : `共 ${activities.length} / ${totalCount} 场`}
            </span>
          </button>
        </div>

        <TimelineRail
          {...sharedRailProps}
          scrollRef={desktopScrollRef}
          pickerId="memory-timeline-group-picker"
        />

        <div className="flex shrink-0 items-center gap-1.5 border-l border-orange-100 px-3">
          <button
            type="button"
            onClick={() => previousActivity && handleSelect(previousActivity)}
            disabled={!previousActivity}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-orange-100 bg-white text-slate-700 transition hover:border-orange-300 hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-35"
            aria-label="上一场活动"
          >
            <UiIcon name="arrow" className="h-4 w-4 rotate-180" />
          </button>
          <button
            type="button"
            onClick={onToggleList}
            className={`flex min-h-11 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${listButtonClassName}`}
            aria-pressed={isListOpen}
          >
            <UiIcon name="list" className="h-4 w-4" />
            活动列表
          </button>
          <button
            type="button"
            onClick={() => nextActivity && handleSelect(nextActivity)}
            disabled={!nextActivity}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-orange-100 bg-white text-slate-700 transition hover:border-orange-300 hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-35"
            aria-label="下一场活动"
          >
            <UiIcon name="arrow" className="h-4 w-4" />
          </button>
        </div>

        <GroupPicker
          id="memory-timeline-group-picker"
          group={openGroup}
          onSelect={handleSelect}
        />
        <TimelineHoverPreview preview={previewState} />
      </div>

      {isDetailOpen ? null : (
        <div
          ref={mobileRootRef}
          className="pointer-events-auto absolute inset-x-2 bottom-2 z-[410] rounded-[22px] border border-orange-200/80 bg-[#fffaf5]/96 px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_14px_40px_rgba(124,45,18,0.16)] backdrop-blur-md md:hidden"
          aria-label="活动时光轨道"
        >
          <div className="flex h-10 items-center gap-1.5">
            <button
              type="button"
              onClick={handleCurrentSummary}
              disabled={!cursorActivity}
              className="min-w-0 flex-1 rounded-xl px-2 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <span className="block truncate text-xs font-extrabold text-slate-950">
                {cursorActivity ? `${cursorActivity.date} · ${cursorActivity.city}` : '全部回忆'}
              </span>
              <span className="block text-[10px] font-semibold text-slate-500">
                {currentPosition ? `${currentPosition} / ${sortedActivities.length}` : `${activities.length} 场活动`}
              </span>
            </button>
            {activities.length === 0 && hasActiveCriteria ? (
              <button
                type="button"
                onClick={onClearFilters}
                className="min-h-11 rounded-xl border border-orange-200 bg-white px-2.5 text-[11px] font-bold text-orange-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
              >
                清空筛选
              </button>
            ) : (
              <button
                type="button"
                onClick={onResetAll}
                className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-orange-100 bg-white text-orange-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
                aria-label="回到全部活动"
              >
                <UiIcon name="expand" className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onToggleList}
              className={`flex min-h-11 min-w-11 items-center justify-center rounded-xl border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${listButtonClassName}`}
              aria-label={isListOpen ? '关闭活动列表' : '打开活动列表'}
              aria-pressed={isListOpen}
            >
              <UiIcon name="list" className="h-4 w-4" />
            </button>
          </div>

          <div className="flex h-12 items-center gap-1">
            <button
              type="button"
              onClick={() => previousActivity && handleSelect(previousActivity)}
              disabled={!previousActivity}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-30"
              aria-label="上一场活动"
            >
              <UiIcon name="arrow" className="h-4 w-4 rotate-180" />
            </button>
            <TimelineRail
              {...sharedRailProps}
              scrollRef={mobileScrollRef}
              pickerId="memory-timeline-group-picker-mobile"
            />
            <button
              type="button"
              onClick={() => nextActivity && handleSelect(nextActivity)}
              disabled={!nextActivity}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-30"
              aria-label="下一场活动"
            >
              <UiIcon name="arrow" className="h-4 w-4" />
            </button>
          </div>

          <GroupPicker
            id="memory-timeline-group-picker-mobile"
            group={openGroup}
            onSelect={handleSelect}
          />
        </div>
      )}

      <p className="sr-only" aria-live="polite">
        {cursorActivity
          ? `${cursorActivity.title}，${cursorActivity.date}，第 ${currentPosition} 场，共 ${sortedActivities.length} 场`
          : `当前显示 ${activities.length} 场活动`}
      </p>
    </>
  )
}
