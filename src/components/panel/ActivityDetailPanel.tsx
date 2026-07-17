'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import UiIcon from '@/components/common/UiIcon'
import RelatedVideoSection from '@/components/videos/RelatedVideoSection'
import type { Activity } from '@/types/activity'

type ActivityDetailPanelProps = {
  activity: Activity | null
  isOpen: boolean
  onClose: () => void
}

const DESKTOP_VIEWPORT_QUERY = '(min-width: 768px)'
const RELATED_VIDEO_MOUNT_DELAY_MS = 320

function useDesktopViewport() {
  const [isDesktopViewport, setIsDesktopViewport] = useState(() =>
    typeof window === 'undefined' ? true : window.matchMedia(DESKTOP_VIEWPORT_QUERY).matches
  )

  useEffect(() => {
    const mediaQuery = window.matchMedia(DESKTOP_VIEWPORT_QUERY)
    const updateViewport = () => setIsDesktopViewport(mediaQuery.matches)

    updateViewport()
    mediaQuery.addEventListener('change', updateViewport)
    return () => {
      mediaQuery.removeEventListener('change', updateViewport)
    }
  }, [])

  return isDesktopViewport
}

function DetailContent({
  activity,
  isOpen,
  shouldLoadVideos,
}: {
  activity: Activity
  isOpen: boolean
  shouldLoadVideos: boolean
}) {
  const [coverLoadFailed, setCoverLoadFailed] = useState(false)
  const [canRenderVideos, setCanRenderVideos] = useState(false)

  useEffect(() => {
    setCoverLoadFailed(false)
  }, [activity.coverImage])

  useEffect(() => {
    if (!isOpen || !shouldLoadVideos) {
      setCanRenderVideos(false)
      return
    }

    const timeoutId = window.setTimeout(() => {
      setCanRenderVideos(true)
    }, RELATED_VIDEO_MOUNT_DELAY_MS)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [activity.id, isOpen, shouldLoadVideos])

  const metaTags = useMemo(
    () => [activity.eventType, `${activity.year} 年`, ...activity.tags.slice(0, 2)],
    [activity.eventType, activity.year, activity.tags]
  )

  return (
    <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3 md:space-y-4 md:px-4 md:py-4">
      <div className="overflow-hidden rounded-2xl border border-orange-100 bg-white shadow-sm">
        <div className="relative aspect-[16/8] w-full md:aspect-[16/9]">
          {coverLoadFailed ? (
            <div className="flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-orange-100 via-[#fff7ed] to-blue-100 text-sm font-bold text-orange-800">
              <UiIcon name="sparkles" className="mb-2 h-6 w-6" />
              珍贵活动瞬间
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

      <div className="space-y-3 rounded-2xl border border-orange-100 bg-white p-3.5 shadow-sm md:p-4">
        <div className="flex flex-wrap items-start justify-between gap-2 md:gap-3">
          <h3 className="min-w-0 flex-1 text-lg font-extrabold leading-7 tracking-tight text-slate-950 md:text-xl">
            {activity.title}
          </h3>
          <Link
            href={`/activities/${activity.slug}`}
            className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            完整详情
            <UiIcon name="arrow" className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {metaTags.map((tag) => (
            <span
              key={`${activity.id}-${tag}`}
              className="rounded-full border border-orange-100 bg-orange-50 px-2.5 py-1 text-[11px] font-bold text-orange-800"
            >
              {tag}
            </span>
          ))}
        </div>

        <div className="grid gap-2 rounded-2xl bg-[#fffaf5] p-3 sm:grid-cols-2 md:grid-cols-1">
          <p className="flex items-start gap-2 text-sm text-slate-700">
            <UiIcon name="calendar" className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" />
            <span><span className="font-bold text-slate-900">日期</span><br />{activity.date}</span>
          </p>
          <p className="flex items-start gap-2 text-sm text-slate-700">
            <UiIcon name="pin" className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
            <span><span className="font-bold text-slate-900">地点</span><br />{activity.city} · {activity.venue}</span>
          </p>
          <p className="flex items-start gap-2 text-sm text-slate-700 sm:col-span-2 md:col-span-1">
            <UiIcon name="users" className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" />
            <span><span className="font-bold text-slate-900">参与成员</span><br />{activity.members.join(' / ')}</span>
          </p>
        </div>
        <div className="border-t border-orange-100 pt-3">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-orange-700">活动回忆</p>
          <p className="mt-2 text-sm leading-6 text-slate-700">{activity.summary}</p>
        </div>
      </div>

      {canRenderVideos ? (
        <RelatedVideoSection activity={activity} variant="panel" />
      ) : (
        <div
          className="h-24 animate-pulse rounded-2xl border border-orange-100 bg-white/80"
          aria-hidden="true"
        />
      )}
    </div>
  )
}

export default function ActivityDetailPanel({
  activity,
  isOpen,
  onClose,
}: ActivityDetailPanelProps) {
  const isVisible = Boolean(activity) && isOpen
  const isDesktopViewport = useDesktopViewport()

  return (
    <>
      {isVisible ? (
        <button
          type="button"
          onClick={onClose}
          className="absolute inset-0 z-[390] bg-slate-950/35 backdrop-blur-[1px]"
          aria-label="关闭活动详情面板"
        />
      ) : null}

      <aside
        className={`absolute left-0 top-0 z-[400] hidden h-full w-full max-w-[440px] transform border-r border-orange-200/80 bg-[#fffaf5]/97 shadow-[0_24px_70px_rgba(124,45,18,0.2)] backdrop-blur-md transition-transform duration-300 will-change-transform [contain:layout_paint] md:block ${
          isVisible ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-full flex-col overflow-hidden">
          <header className="flex items-center justify-between border-b border-orange-100 bg-[#fffaf5]/90 px-4 py-3.5">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-600 text-white">
                <UiIcon name="sparkles" className="h-[18px] w-[18px]" />
              </span>
              <div>
                <h2 className="text-sm font-extrabold text-slate-950">活动回忆</h2>
                <p className="text-[11px] text-slate-500">沿着坐标，再见那一天</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-orange-100 bg-white text-slate-600 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
              aria-label="关闭面板"
            >
              <UiIcon name="close" className="h-4 w-4" />
            </button>
          </header>

          {activity && isDesktopViewport ? (
            <DetailContent
              activity={activity}
              isOpen={isVisible}
              shouldLoadVideos={isDesktopViewport}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center text-sm text-slate-600">
              <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-100 text-orange-700">
                <UiIcon name="pin" className="h-6 w-6" />
              </span>
              点击地图上的活动缩略图查看详情
            </div>
          )}
        </div>
      </aside>

      <aside
        className={`absolute inset-x-0 bottom-0 z-[400] max-h-[68vh] transform rounded-t-[28px] border border-orange-200/80 bg-[#fffaf5]/97 shadow-[0_-18px_60px_rgba(124,45,18,0.18)] backdrop-blur-md transition-transform duration-300 will-change-transform [contain:layout_paint] md:hidden ${
          isVisible ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="mx-auto mt-2.5 h-1.5 w-11 rounded-full bg-orange-200" />

        <div className="flex h-[calc(68vh-0.65rem)] flex-col overflow-hidden">
          <header className="flex items-center justify-between border-b border-orange-100 px-3.5 py-2.5">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-600 text-white">
                <UiIcon name="sparkles" className="h-4 w-4" />
              </span>
              <h2 className="text-sm font-extrabold text-slate-950">活动回忆</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-orange-100 bg-white px-3 text-xs font-bold text-slate-700 transition hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
              aria-label="关闭抽屉"
            >
              <UiIcon name="collapse" className="h-4 w-4" />
              收起
            </button>
          </header>

          {activity && !isDesktopViewport ? (
            <DetailContent
              activity={activity}
              isOpen={isVisible}
              shouldLoadVideos={!isDesktopViewport}
            />
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
