'use client'
import { useMemo, useRef } from 'react'
import UiIcon from '@/components/common/UiIcon'
import FallbackImage from '@/components/common/FallbackImage'
import { usePanelFocus } from '@/components/hooks/usePanelFocus'
import { useResultListMotion } from '@/components/hooks/useResultListMotion'
import type { Activity } from '@/types/activity'

type Props = {
  activities: Activity[]
  selectedActivityId: string | null
  isOpen: boolean
  onClose: () => void
  onSelect: (activity: Activity) => void
  onClearFilters: () => void
  isDesktop: boolean
}
export default function ActivityResultList({
  activities,
  selectedActivityId,
  isOpen,
  onClose,
  onSelect,
  onClearFilters,
  isDesktop,
}: Props) {
  const panel = useRef<HTMLElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const ordered = useMemo(
    () => [...activities].sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id)),
    [activities],
  )
  useResultListMotion(scroller, ordered.map((activity) => activity.id).join('\n'), isOpen)
  usePanelFocus(panel, isOpen, onClose)
  return (
    <aside
      ref={panel}
      data-map-edge={isDesktop ? 'right' : 'bottom'}
      data-map-active={isOpen}
      aria-label="活动列表"
      aria-hidden={!isOpen}
      inert={!isOpen}
      className={`memory-side-panel memory-results ${isOpen ? 'is-open' : ''}`}
    >
      <header className="flex shrink-0 items-center justify-between border-b border-orange-100 px-4 py-2">
        <div>
          <h2 className="text-sm font-bold">活动列表</h2>
          <p className="text-xs text-slate-600">
            找到 {activities.length} 场回忆
          </p>
        </div>
        <button
          className="memory-button icon"
          aria-label="关闭活动列表"
          onClick={onClose}
        >
          <UiIcon name="close" className="h-4 w-4" />
        </button>
      </header>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
        {!activities.length ? (
          <div className="py-8 text-center text-sm">
            <p>没有匹配的活动</p>
            <button
              className="memory-button mx-auto mt-4"
              onClick={onClearFilters}
            >
              清空筛选
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {ordered.map((a) => (
                <button
                  key={a.id}
                  data-activity-card={a.id}
                  aria-pressed={selectedActivityId === a.id}
                  onClick={() => onSelect(a)}
                  className={`memory-result-card ${selectedActivityId === a.id ? 'selected' : ''}`}
                >
                  <FallbackImage
                    src={a.coverImage}
                    alt=""
                    width={64}
                    height={72}
                    wrapperClassName="memory-lift-cover h-[72px] w-16 shrink-0 overflow-hidden rounded-[10px]"
                    className="h-full w-full object-cover"
                    fallbackText="活动"
                    sizes="64px"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs text-slate-600">
                      {a.date} · {a.city}
                    </span>
                    <span className="memory-lift-title mt-1 block line-clamp-2 text-sm font-bold leading-5">
                      {a.title}
                    </span>
                    <span className="mt-1 block truncate text-xs text-slate-600">
                      {a.venue}
                    </span>
                  </span>
                  <UiIcon
                    name="arrow"
                    className="h-4 w-4 shrink-0 text-blue-600"
                  />
                </button>
              ))}
          </div>
        )}
      </div>
    </aside>
  )
}
