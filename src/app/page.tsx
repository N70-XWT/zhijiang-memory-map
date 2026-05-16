'use client'

import dynamic from 'next/dynamic'
import FeedbackContactLink from '@/components/common/FeedbackContactLink'
import { getAllActivities } from '@/data/activityRepository'

const FullscreenMap = dynamic(() => import('@/components/map/FullscreenMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-slate-100 text-sm text-slate-700">
      地图加载中...
    </div>
  ),
})

const activities = getAllActivities()

export default function HomePage() {
  return (
    <main className="relative h-screen w-screen overflow-hidden bg-slate-900 text-slate-900">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[450] flex justify-center px-3 pt-3 md:px-4 md:pt-4">
        <div className="pointer-events-auto max-w-[calc(100vw-1.5rem)] truncate rounded-full border border-slate-300 bg-slate-50/95 px-3 py-1.5 text-xs font-medium tracking-wide text-slate-900 shadow-sm backdrop-blur-md md:px-4 md:py-2 md:text-sm">
          A-SOUL 线下活动回忆地图
        </div>
      </div>

      <FeedbackContactLink />
      <FullscreenMap activities={activities} />
    </main>
  )
}
