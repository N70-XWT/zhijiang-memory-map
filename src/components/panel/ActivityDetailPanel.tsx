'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import RelatedVideoSection from '@/components/videos/RelatedVideoSection'
import type { Activity } from '@/types/activity'

type ActivityDetailPanelProps = {
  activity: Activity | null
  isOpen: boolean
  onClose: () => void
}

function DetailContent({ activity }: { activity: Activity }) {
  const [coverLoadFailed, setCoverLoadFailed] = useState(false)

  useEffect(() => {
    setCoverLoadFailed(false)
  }, [activity.coverImage])

  const metaTags = useMemo(
    () => [activity.eventType, `${activity.year} 年`, ...activity.tags.slice(0, 2)],
    [activity.eventType, activity.year, activity.tags]
  )

  return (
    <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3 md:space-y-4 md:px-4 md:py-4">
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="relative aspect-[16/8] w-full md:aspect-[16/9]">
          {coverLoadFailed ? (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-200 to-slate-300 text-sm text-slate-600">
              活动封面
            </div>
          ) : (
            <img
              src={activity.coverImage}
              alt={activity.title}
              className="h-full w-full object-cover"
              loading="lazy"
              decoding="async"
              width={640}
              height={360}
              onError={() => setCoverLoadFailed(true)}
            />
          )}
        </div>
      </div>

      <div className="space-y-2.5 rounded-lg border border-slate-200 bg-white p-3 md:space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2 md:gap-3">
          <h3 className="min-w-0 flex-1 text-base font-semibold leading-6 text-slate-900 md:text-lg">
            {activity.title}
          </h3>
          <Link
            href={`/activities/${activity.slug}`}
            className="shrink-0 rounded-md border border-slate-300 bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-200"
          >
            查看活动详情
          </Link>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {metaTags.map((tag) => (
            <span
              key={`${activity.id}-${tag}`}
              className="rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
            >
              {tag}
            </span>
          ))}
        </div>

        <p className="text-sm text-slate-700">日期：{activity.date}</p>
        <p className="text-sm text-slate-700">
          地点：{activity.city} · {activity.venue}
        </p>
        <p className="text-sm text-slate-700">成员：{activity.members.join(' / ')}</p>
        <p className="text-sm leading-6 text-slate-700">{activity.summary}</p>
      </div>

      <RelatedVideoSection activity={activity} variant="panel" />
    </div>
  )
}

export default function ActivityDetailPanel({
  activity,
  isOpen,
  onClose,
}: ActivityDetailPanelProps) {
  const isVisible = Boolean(activity) && isOpen

  return (
    <>
      {isVisible ? (
        <button
          type="button"
          onClick={onClose}
          className="absolute inset-0 z-[390] bg-slate-900/30"
          aria-label="关闭活动详情面板"
        />
      ) : null}

      <aside
        className={`absolute left-0 top-0 z-[400] hidden h-full w-full max-w-[420px] transform border-r border-slate-300/90 bg-slate-50/95 shadow-panel backdrop-blur-md transition-transform duration-300 md:block ${
          isVisible ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-full flex-col overflow-hidden">
          <header className="flex items-center justify-between border-b border-slate-200 bg-slate-100/80 px-4 py-3">
            <h2 className="text-sm font-semibold tracking-wide text-slate-900">活动详情</h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-200 hover:text-slate-900"
              aria-label="关闭面板"
            >
              关闭
            </button>
          </header>

          {activity ? (
            <DetailContent activity={activity} />
          ) : (
            <div className="flex h-full items-center justify-center px-4 text-sm text-slate-600">
              点击地图上的活动缩略图查看详情
            </div>
          )}
        </div>
      </aside>

      <aside
        className={`absolute inset-x-0 bottom-0 z-[400] max-h-[62vh] transform rounded-t-2xl border border-slate-300/90 bg-slate-50/95 shadow-panel backdrop-blur-md transition-transform duration-300 md:hidden ${
          isVisible ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-slate-300" />

        <div className="flex h-[calc(62vh-0.5rem)] flex-col overflow-hidden">
          <header className="flex items-center justify-between border-b border-slate-200 px-3 py-2.5">
            <h2 className="text-sm font-semibold text-slate-900">活动详情</h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
              aria-label="关闭抽屉"
            >
              收起
            </button>
          </header>

          {activity ? (
            <DetailContent activity={activity} />
          ) : (
            <div className="flex h-full items-center justify-center px-4 text-sm text-slate-600">
              点击地图上的活动缩略图查看详情
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
