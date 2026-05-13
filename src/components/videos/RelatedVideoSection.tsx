'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import VideoCard from '@/components/cards/VideoCard'
import type { Activity, BilibiliVideo } from '@/types/activity'

type RelatedVideoSectionProps = {
  activity: Activity
  variant: 'panel' | 'page'
}

type RelatedVideosResponse = {
  error?: string
  hasMore?: boolean
  nextPage?: number | null
  videos?: BilibiliVideo[]
}

type CachedRelatedVideos = {
  hasMore: boolean
  nextPage: number | null
  videos: BilibiliVideo[]
}

type LoadingNoticeProps = {
  label: string
}

const getCacheKey = (activityId: string): string => `bilibili-related-videos:v3:${activityId}`

const getCachedRelatedState = (activityId: string): CachedRelatedVideos | null => {
  try {
    const cached = window.sessionStorage.getItem(getCacheKey(activityId))
    if (!cached) {
      return null
    }

    const parsed = JSON.parse(cached) as Partial<CachedRelatedVideos>
    return {
      videos: parsed.videos ?? [],
      nextPage: parsed.nextPage ?? null,
      hasMore: Boolean(parsed.hasMore),
    }
  } catch {
    return null
  }
}

const setCachedRelatedVideos = (
  activityId: string,
  state: CachedRelatedVideos
): void => {
  try {
    window.sessionStorage.setItem(getCacheKey(activityId), JSON.stringify(state))
  } catch {
    // sessionStorage may be unavailable in private browsing modes.
  }
}

const getVideoKey = (video: BilibiliVideo): string => video.id || video.url

const mergeVideos = (currentVideos: BilibiliVideo[], nextVideos: BilibiliVideo[]) => {
  const usedKeys = new Set(currentVideos.map(getVideoKey))
  const merged = [...currentVideos]

  for (const video of nextVideos) {
    const key = getVideoKey(video)
    if (!key || usedKeys.has(key)) {
      continue
    }

    usedKeys.add(key)
    merged.push(video)
  }

  return merged
}

function LoadingNotice({ label }: LoadingNoticeProps) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-blue-300 bg-blue-50 px-3 py-3 text-sm text-blue-800">
      <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-blue-300 border-t-blue-700" />
      <span>{label}</span>
    </div>
  )
}

export default function RelatedVideoSection({ activity, variant }: RelatedVideoSectionProps) {
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  const isLoadingMoreRef = useRef(false)
  const [recommendedVideos, setRecommendedVideos] = useState<BilibiliVideo[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [nextPage, setNextPage] = useState<number | null>(1)

  const fetchRelatedVideos = useCallback(
    async (
      page: number,
      controller: AbortController,
      mode: 'initial' | 'append',
      excludedVideos: BilibiliVideo[] = []
    ) => {
      const exclude = excludedVideos
        .map((video) => video.id)
        .filter(Boolean)
        .join(',')
      const params = new URLSearchParams({
        activityId: activity.id,
        page: String(page),
      })
      if (exclude) {
        params.set('exclude', exclude)
      }

      const response = await fetch(
        `/api/bilibili/related-videos?${params.toString()}`,
        { signal: controller.signal }
      )

      if (!response.ok) {
        setHasMore(false)
        setNextPage(null)
        return
      }

      const payload = (await response.json()) as RelatedVideosResponse
      if (payload.error) {
        setHasMore(false)
        setNextPage(null)
        return
      }

      const videos = payload.videos ?? []
      setRecommendedVideos((currentVideos) => {
        const mergedVideos = mode === 'append' ? mergeVideos(currentVideos, videos) : videos
        const nextState = {
          videos: mergedVideos,
          nextPage: payload.nextPage ?? null,
          hasMore: Boolean(payload.hasMore),
        }
        setCachedRelatedVideos(activity.id, nextState)
        return mergedVideos
      })
      setHasMore(Boolean(payload.hasMore))
      setNextPage(payload.nextPage ?? null)
    },
    [activity.id]
  )

  useEffect(() => {
    const cached = getCachedRelatedState(activity.id)
    if (cached) {
      setRecommendedVideos(cached.videos)
      isLoadingMoreRef.current = false
      setIsLoading(false)
      setIsLoadingMore(false)
      setHasLoaded(true)
      setHasMore(cached.hasMore)
      setNextPage(cached.nextPage)
      return
    }

    const controller = new AbortController()
    isLoadingMoreRef.current = false
    setRecommendedVideos([])
    setIsLoading(true)
    setIsLoadingMore(false)
    setHasLoaded(false)
    setHasMore(false)
    setNextPage(1)

    const fetchInitialVideos = async () => {
      try {
        await fetchRelatedVideos(1, controller, 'initial')
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setRecommendedVideos([])
          setHasMore(false)
          setNextPage(null)
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false)
          setHasLoaded(true)
        }
      }
    }

    fetchInitialVideos()

    return () => controller.abort()
  }, [activity.id, fetchRelatedVideos])

  useEffect(() => {
    const node = loadMoreRef.current
    if (!node || !hasLoaded || !hasMore || !nextPage || isLoading) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries
        if (!entry?.isIntersecting || isLoadingMoreRef.current) {
          return
        }

        const controller = new AbortController()
        isLoadingMoreRef.current = true
        setIsLoadingMore(true)

        fetchRelatedVideos(nextPage, controller, 'append', recommendedVideos)
          .catch((error) => {
            if (!(error instanceof DOMException && error.name === 'AbortError')) {
              setHasMore(false)
              setNextPage(null)
            }
          })
          .finally(() => {
            isLoadingMoreRef.current = false
            setIsLoadingMore(false)
          })
      },
      { rootMargin: '160px 0px' }
    )

    observer.observe(node)

    return () => {
      observer.disconnect()
    }
  }, [fetchRelatedVideos, hasLoaded, hasMore, isLoading, nextPage, recommendedVideos])

  const isPage = variant === 'page'
  const sectionClassName = isPage
    ? 'mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6'
    : 'space-y-3 pb-2'
  const titleClassName = isPage ? 'text-lg font-semibold' : 'text-sm font-semibold text-slate-900'
  const gridClassName = isPage ? 'grid gap-3 md:grid-cols-2' : 'space-y-3'
  const emptyClassName =
    'rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm text-slate-600'

  return (
    <section className={sectionClassName}>
      <h2 className={titleClassName}>B站相关视频</h2>

      <div className={isPage ? 'mt-4 space-y-5' : 'space-y-4'}>
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-slate-500">收录视频</h3>
          {activity.bilibiliVideos.length === 0 ? (
            <p className={emptyClassName}>当前活动暂未收录相关视频。</p>
          ) : (
            <div className={gridClassName}>
              {activity.bilibiliVideos.map((video) => (
                <VideoCard key={`preset-${video.id}`} video={video} />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-slate-500">自动推荐</h3>
          {isLoading ? (
            <LoadingNotice label="正在搜索 B 站相关视频..." />
          ) : recommendedVideos.length > 0 ? (
            <>
              <div className={gridClassName}>
                {recommendedVideos.map((video) => (
                  <VideoCard key={`recommended-${getVideoKey(video)}`} video={video} />
                ))}
              </div>
              {isLoadingMore ? (
                <LoadingNotice label="正在加载更多..." />
              ) : hasMore ? (
                <div ref={loadMoreRef} className="h-8" aria-hidden="true" />
              ) : (
                <p className={emptyClassName}>已加载全部推荐。</p>
              )}
            </>
          ) : hasLoaded ? (
            <p className={emptyClassName}>暂无更多推荐。</p>
          ) : null}
        </div>
      </div>
    </section>
  )
}
