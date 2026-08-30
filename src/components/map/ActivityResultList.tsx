'use client'

import UiIcon from '@/components/common/UiIcon'
import type { Activity } from '@/types/activity'

type ActivityResultListProps = {
  activities: Activity[]
  selectedActivityId: string | null
  isOpen: boolean
  onClose: () => void
  onSelect: (activity: Activity) => void
}

export default function ActivityResultList({
  activities,
  selectedActivityId,
  isOpen,
  onClose,
  onSelect,
}: ActivityResultListProps) {
  const sortedActivities = [...activities].sort((a, b) => b.date.localeCompare(a.date))

  return (
    <aside
      className={`absolute inset-x-2 bottom-[calc(132px+env(safe-area-inset-bottom))] z-[405] max-h-[48vh] transform overflow-hidden rounded-[24px] border border-orange-200/80 bg-[#fffaf5]/95 shadow-[0_24px_60px_rgba(124,45,18,0.18)] backdrop-blur-md transition-all duration-200 will-change-transform [contain:layout_paint] md:bottom-auto md:left-auto md:right-5 md:top-[168px] md:w-[380px] md:max-h-[calc(100vh-17rem)] ${
        isOpen
          ? 'pointer-events-auto translate-y-0 opacity-100'
          : 'pointer-events-none translate-y-3 opacity-0 md:translate-x-3 md:translate-y-0'
      }`}
      aria-hidden={!isOpen}
    >
      <div className="h-1 w-full bg-gradient-to-r from-blue-600 via-orange-400 to-orange-500" />
      <div className="flex items-center justify-between border-b border-orange-100 px-3.5 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
            <UiIcon name="list" className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-extrabold text-slate-950">活动列表</h2>
            <p className="text-[11px] font-medium text-slate-500">当前找到 {activities.length} 个活动</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-orange-100 bg-white text-slate-600 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
          aria-label="关闭活动列表"
        >
          <UiIcon name="close" className="h-4 w-4" />
        </button>
      </div>

      <div className="max-h-[calc(48vh-4.25rem)] overflow-y-auto p-2.5 md:max-h-[calc(100vh-21.25rem)]">
        {sortedActivities.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-orange-200 bg-white/80 px-4 py-8 text-center">
            <UiIcon name="search" className="mx-auto h-6 w-6 text-orange-400" />
            <p className="mt-2 text-xs font-bold text-slate-700">没有匹配的活动</p>
            <p className="mt-1 text-[11px] text-slate-500">试试调整或清空筛选条件</p>
          </div>
        ) : (
          <div className="space-y-2">
            {sortedActivities.map((activity) => {
              const isSelected = selectedActivityId === activity.id

              return (
                <button
                  key={activity.id}
                  type="button"
                  onClick={() => onSelect(activity)}
                  className={`group relative min-h-11 w-full overflow-hidden rounded-2xl border bg-white p-3 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 ${
                    isSelected
                      ? 'border-orange-400 ring-1 ring-orange-300'
                      : 'border-orange-100'
                  }`}
                >
                  <span
                    className={`absolute inset-y-0 left-0 w-1 ${
                      isSelected ? 'bg-orange-500' : 'bg-transparent group-hover:bg-orange-300'
                    }`}
                  />
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-2 py-1 text-[10px] font-bold text-orange-800">
                        <UiIcon name="calendar" className="h-3 w-3" />
                        {activity.date}
                      </p>
                      <h3 className="mt-2 line-clamp-2 text-sm font-extrabold leading-5 text-slate-950">
                        {activity.title}
                      </h3>
                      <p className="mt-1.5 flex items-center gap-1 truncate text-xs text-slate-500">
                        <UiIcon name="pin" className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                        {activity.city} · {activity.venue}
                      </p>
                    </div>
                    <span className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700 transition group-hover:bg-blue-600 group-hover:text-white">
                      <UiIcon name="arrow" className="h-4 w-4" />
                    </span>
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-1">
                    {activity.members.slice(0, 4).map((member) => (
                      <span
                        key={`${activity.id}-${member}`}
                        className="rounded-full border border-blue-100 bg-blue-50/70 px-2 py-0.5 text-[10px] font-semibold text-blue-800"
                      >
                        {member}
                      </span>
                    ))}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </aside>
  )
}
