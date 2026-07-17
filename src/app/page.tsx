'use client'

import dynamic from 'next/dynamic'
import FeedbackContactLink from '@/components/common/FeedbackContactLink'
import UiIcon from '@/components/common/UiIcon'
import { getAllActivities } from '@/data/activityRepository'

const FullscreenMap = dynamic(() => import('@/components/map/FullscreenMap'), {
  ssr: false,
  loading: () => (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[#fff7ed] px-6 text-center">
      <div className="absolute -left-16 top-1/4 h-56 w-56 rounded-full bg-orange-200/45 blur-3xl" />
      <div className="absolute -right-16 bottom-1/4 h-56 w-56 rounded-full bg-blue-200/40 blur-3xl" />
      <div className="relative rounded-[28px] border border-orange-200/80 bg-white/90 px-8 py-7 shadow-[0_24px_70px_rgba(124,45,18,0.14)] backdrop-blur-md">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-600 text-white shadow-lg shadow-orange-600/25">
          <UiIcon name="map" className="h-6 w-6 animate-pulse" />
        </div>
        <p className="mt-4 text-base font-bold text-slate-950">正在铺开回忆地图</p>
        <p className="mt-1 text-xs text-slate-500">活动坐标与珍贵瞬间加载中…</p>
      </div>
    </div>
  ),
})

const activities = getAllActivities()

export default function HomePage() {
  return (
    <main className="relative h-[100dvh] w-screen overflow-hidden bg-[#fff7ed] text-slate-950">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[450] flex justify-center px-2.5 pt-2.5 md:px-4 md:pt-4">
        <div className="pointer-events-auto flex max-w-[calc(100vw-1.25rem)] items-center gap-2.5 rounded-2xl border border-orange-200/80 bg-[#fffaf5]/95 px-3 py-2 shadow-[0_12px_36px_rgba(124,45,18,0.14)] backdrop-blur-md md:rounded-full md:px-4 md:py-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-orange-600 text-white shadow-sm shadow-orange-600/25 md:rounded-full">
            <UiIcon name="map" className="h-[18px] w-[18px]" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-extrabold tracking-tight text-slate-950 md:text-[15px]">
              枝江线下回忆地图
            </span>
            <span className="hidden truncate text-[11px] font-medium text-slate-500 sm:block">
              沿着坐标，重逢 A-SOUL 的线下瞬间
            </span>
          </span>
          <span className="hidden shrink-0 items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-blue-700 sm:inline-flex">
            <UiIcon name="sparkles" className="h-3.5 w-3.5" />
            {activities.length} 个活动
          </span>
        </div>
      </div>

      <FeedbackContactLink />
      <FullscreenMap activities={activities} />
    </main>
  )
}
