'use client'

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
      className={`absolute inset-x-2 bottom-20 z-[405] max-h-[48vh] transform overflow-hidden rounded-2xl border border-slate-300/90 bg-slate-50/95 shadow-panel backdrop-blur-md transition-all duration-200 will-change-transform [contain:layout_paint] md:bottom-auto md:left-auto md:right-5 md:top-24 md:w-[360px] md:max-h-[calc(100vh-9rem)] ${
        isOpen
          ? 'pointer-events-auto translate-y-0 opacity-100'
          : 'pointer-events-none translate-y-3 opacity-0 md:translate-y-0 md:translate-x-3'
      }`}
      aria-hidden={!isOpen}
    >
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2.5">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900">活动列表</h2>
          <p className="text-xs text-slate-600">当前筛选 {activities.length} 个活动</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
        >
          关闭
        </button>
      </div>

      <div className="max-h-[calc(48vh-3.5rem)] overflow-y-auto p-2 md:max-h-[calc(100vh-12.5rem)]">
        {sortedActivities.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white px-3 py-4 text-center text-xs text-slate-600">
            当前筛选条件下暂无活动
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
                  className={`w-full rounded-lg border bg-white p-3 text-left shadow-sm transition hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 ${
                    isSelected ? 'border-amber-400 ring-1 ring-amber-300' : 'border-slate-200'
                  }`}
                >
                  <p className="text-xs font-medium text-slate-500">{activity.date}</p>
                  <h3 className="mt-1 line-clamp-2 text-sm font-semibold leading-5 text-slate-900">
                    {activity.title}
                  </h3>
                  <p className="mt-1 truncate text-xs text-slate-600">
                    {activity.city} · {activity.venue}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {activity.members.map((member) => (
                      <span
                        key={`${activity.id}-${member}`}
                        className="rounded-full border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700"
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
