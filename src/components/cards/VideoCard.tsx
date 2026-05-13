'use client'

import { useEffect, useMemo, useState } from 'react'
import type { BilibiliVideo } from '@/types/activity'

type VideoCardProps = {
  video: BilibiliVideo
}

const SOURCE_TYPE_LABEL: Record<BilibiliVideo['sourceType'], string> = {
  official: 'official',
  fan: 'fan',
}

type BilibiliVideoMeta = {
  id: string
  title: string
  cover: string
}

const BVID_PATTERN = /BV[a-zA-Z0-9]{8,}/

const extractBvid = (video: BilibiliVideo): string | null => {
  const source = `${video.id} ${video.url}`
  return source.match(BVID_PATTERN)?.[0] ?? null
}

const isRuntimeCoverPath = (value: string | undefined): boolean => {
  if (!value || value.trim().length === 0) {
    return false
  }
  return !value.startsWith('/mock/')
}

const getCachedVideoMeta = (bvid: string): BilibiliVideoMeta | null => {
  try {
    const cached = window.sessionStorage.getItem(`bilibili-video-meta:${bvid}`)
    return cached ? (JSON.parse(cached) as BilibiliVideoMeta) : null
  } catch {
    return null
  }
}

const setCachedVideoMeta = (meta: BilibiliVideoMeta): void => {
  try {
    window.sessionStorage.setItem(`bilibili-video-meta:${meta.id}`, JSON.stringify(meta))
  } catch {
    // sessionStorage may be unavailable in private browsing modes.
  }
}

export default function VideoCard({ video }: VideoCardProps) {
  const [coverLoadFailed, setCoverLoadFailed] = useState(false)
  const [hasFetchedRemoteMeta, setHasFetchedRemoteMeta] = useState(false)
  const [resolvedVideo, setResolvedVideo] = useState(() => ({
    title: video.title,
    cover: isRuntimeCoverPath(video.cover) ? video.cover : '',
  }))

  useEffect(() => {
    setCoverLoadFailed(false)
    setHasFetchedRemoteMeta(false)
    setResolvedVideo({
      title: video.title,
      cover: isRuntimeCoverPath(video.cover) ? video.cover : '',
    })
  }, [video.cover, video.title, video.url])

  useEffect(() => {
    const bvid = extractBvid(video)
    const shouldFetchMeta = bvid && (!resolvedVideo.cover || (coverLoadFailed && !hasFetchedRemoteMeta))

    if (!bvid || !shouldFetchMeta) {
      return
    }

    const cached = getCachedVideoMeta(bvid)
    if (cached?.cover) {
      setCoverLoadFailed(false)
      setHasFetchedRemoteMeta(true)
      setResolvedVideo({
        title: cached.title || video.title,
        cover: cached.cover,
      })
      return
    }

    const controller = new AbortController()

    const fetchVideoMeta = async () => {
      try {
        const response = await fetch(`/api/bilibili/video-meta?bvid=${encodeURIComponent(bvid)}`, {
          signal: controller.signal,
        })

        if (!response.ok) {
          return
        }

        const meta = (await response.json()) as BilibiliVideoMeta
        if (!meta.cover) {
          return
        }

        setCachedVideoMeta(meta)
        setCoverLoadFailed(false)
        setHasFetchedRemoteMeta(true)
        setResolvedVideo({
          title: meta.title || video.title,
          cover: meta.cover,
        })
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          setCoverLoadFailed(true)
        }
      }
    }

    fetchVideoMeta()

    return () => controller.abort()
  }, [coverLoadFailed, hasFetchedRemoteMeta, resolvedVideo.cover, video])

  const sourceTypeClassName = useMemo(() => {
    if (video.sourceType === 'official') {
      return 'border-slate-900 bg-slate-900 text-slate-50'
    }
    return 'border-slate-300 bg-slate-100 text-slate-700'
  }, [video.sourceType])

  return (
    <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="relative aspect-video w-full overflow-hidden border-b border-slate-200 bg-slate-200">
        {coverLoadFailed ? (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-200 to-slate-300 text-xs text-slate-600">
            视频封面
          </div>
        ) : !resolvedVideo.cover ? (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-200 to-slate-300 text-xs text-slate-600">
            视频封面
          </div>
        ) : (
          <img
            src={resolvedVideo.cover}
            alt={resolvedVideo.title}
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            width={480}
            height={270}
            onError={() => setCoverLoadFailed(true)}
          />
        )}
      </div>

      <div className="space-y-2.5 p-3">
        <h4
          className="text-sm font-medium leading-5 text-slate-900"
          style={{
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {resolvedVideo.title}
        </h4>

        <div className="flex items-center gap-2 text-xs text-slate-700">
          <span className={`rounded-full border px-2 py-0.5 font-medium ${sourceTypeClassName}`}>
            {SOURCE_TYPE_LABEL[video.sourceType]}
          </span>
          {video.note ? <span className="truncate text-slate-600">{video.note}</span> : null}
        </div>

        <a
          href={video.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center rounded-md border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-50 transition hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 disabled:pointer-events-none disabled:opacity-60"
        >
          前往 B 站
        </a>
      </div>
    </article>
  )
}
