import {
  findRelatedBilibiliVideos,
  generateRelatedBilibiliVideoList,
  type RelatedBilibiliVideoPage,
} from '@/lib/bilibili'
import { getActivityById } from '@/data/activityRepository'
import {
  acquireRefreshLock,
  getCachedRelatedVideos,
  releaseRefreshLock,
  setCachedRelatedVideos,
  type RelatedVideoCacheEntry,
} from '@/lib/relatedVideoCache'
import type { BilibiliVideo } from '@/types/activity'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type RateLimitBucket = {
  count: number
  resetAt: number
}

const FRESH_CACHE_TTL_MS = 1000 * 60 * 60 * 24
const STALE_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 14
const RATE_LIMIT_WINDOW_MS = 1000 * 60
const RATE_LIMIT_MAX_REQUESTS = 30
const MAX_RELATED_VIDEO_PAGE = 6
const RECOMMEND_PAGE_SIZE = 8
const RELATED_VIDEO_ALGORITHM_VERSION = 'v8'
const CACHE_WAIT_RETRY_COUNT = 8
const CACHE_WAIT_RETRY_MS = 250

const rateLimitBuckets = new Map<string, RateLimitBucket>()

const sleep = (durationMs: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, durationMs))

const getClientKey = (request: Request): string => {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwardedFor || request.headers.get('x-real-ip') || 'local'
}

const isRateLimited = (clientKey: string): boolean => {
  const now = Date.now()
  const current = rateLimitBuckets.get(clientKey)

  if (!current || current.resetAt <= now) {
    rateLimitBuckets.set(clientKey, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    })
    return false
  }

  current.count += 1
  return current.count > RATE_LIMIT_MAX_REQUESTS
}

const isAuthorizedRefresh = (request: Request, searchParams: URLSearchParams): boolean => {
  const secret = process.env.CACHE_WARM_SECRET?.trim()
  if (!secret) {
    return false
  }

  return (
    searchParams.get('secret') === secret ||
    request.headers.get('x-cache-warm-secret') === secret
  )
}

const getVideoKey = (video: BilibiliVideo): string => video.id || video.url

const toPagedPayload = (
  videos: BilibiliVideo[],
  page: number,
  excludedBvids: Set<string>
): RelatedBilibiliVideoPage => {
  const startIndex = (page - 1) * RECOMMEND_PAGE_SIZE
  const selected: BilibiliVideo[] = []
  let cursor = startIndex

  while (cursor < videos.length && selected.length < RECOMMEND_PAGE_SIZE) {
    const video = videos[cursor]
    if (video && !excludedBvids.has(getVideoKey(video))) {
      selected.push(video)
    }
    cursor += 1
  }

  const hasMore = videos
    .slice(cursor)
    .some((video) => !excludedBvids.has(getVideoKey(video)))

  return {
    videos: selected,
    hasMore,
    nextPage: hasMore ? page + 1 : null,
  }
}

const jsonWithCacheHeaders = (
  payload: RelatedBilibiliVideoPage,
  cacheState: 'fresh' | 'stale' | 'miss' | 'debug' | 'error'
) =>
  Response.json(payload, {
    headers: {
      'Cache-Control': 's-maxage=86400, stale-while-revalidate=604800',
      'X-Related-Video-Algorithm': RELATED_VIDEO_ALGORITHM_VERSION,
      'X-Related-Video-Cache': cacheState,
    },
  })

const createCacheEntry = (
  activityId: string,
  videos: BilibiliVideo[],
  error?: string
): RelatedVideoCacheEntry => {
  const generatedAt = Date.now()
  return {
    activityId,
    algorithmVersion: RELATED_VIDEO_ALGORITHM_VERSION,
    videos,
    generatedAt,
    expiresAt: generatedAt + FRESH_CACHE_TTL_MS,
    staleUntil: generatedAt + STALE_CACHE_TTL_MS,
    error,
  }
}

const refreshActivityCache = async (
  activityId: string,
  pageLimit = MAX_RELATED_VIDEO_PAGE
): Promise<RelatedVideoCacheEntry> => {
  const activity = getActivityById(activityId)
  if (!activity) {
    throw new Error('Activity not found.')
  }

  const result = await generateRelatedBilibiliVideoList(activity, pageLimit)
  const entry = createCacheEntry(activityId, result.videos)
  await setCachedRelatedVideos(entry)
  return entry
}

const triggerBackgroundRefresh = async (activityId: string): Promise<void> => {
  const locked = await acquireRefreshLock(activityId, RELATED_VIDEO_ALGORITHM_VERSION)
  if (!locked) {
    return
  }

  void refreshActivityCache(activityId)
    .catch(async (error) => {
      const cached = await getCachedRelatedVideos(activityId, RELATED_VIDEO_ALGORITHM_VERSION)
      if (!cached) {
        return
      }

      await setCachedRelatedVideos({
        ...cached.entry,
        error: error instanceof Error ? error.message : 'Failed to refresh related videos.',
      })
    })
    .finally(() => {
      void releaseRefreshLock(activityId, RELATED_VIDEO_ALGORITHM_VERSION)
    })
}

const waitForGeneratedCache = async (
  activityId: string
): Promise<Awaited<ReturnType<typeof getCachedRelatedVideos>>> => {
  for (let attempt = 0; attempt < CACHE_WAIT_RETRY_COUNT; attempt += 1) {
    await sleep(CACHE_WAIT_RETRY_MS)
    const cached = await getCachedRelatedVideos(activityId, RELATED_VIDEO_ALGORITHM_VERSION)
    if (cached) {
      return cached
    }
  }

  return null
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const activityId = searchParams.get('activityId')?.trim()
  const rawPage = Number.parseInt(searchParams.get('page') ?? '1', 10)
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1
  const rawWarmPageLimit = Number.parseInt(
    searchParams.get('warmPageLimit') ?? String(MAX_RELATED_VIDEO_PAGE),
    10
  )
  const warmPageLimit =
    Number.isFinite(rawWarmPageLimit) && rawWarmPageLimit > 0
      ? Math.min(rawWarmPageLimit, MAX_RELATED_VIDEO_PAGE)
      : MAX_RELATED_VIDEO_PAGE
  const debug = searchParams.get('debug') === '1' && process.env.NODE_ENV !== 'production'
  const forceRefresh = searchParams.get('refresh') === '1'
  const rawExclude = searchParams.get('exclude') ?? ''
  const excludedBvidList = rawExclude
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  const excludedBvids = new Set(excludedBvidList)

  if (!activityId) {
    return Response.json(
      { error: 'Missing activityId.', videos: [], hasMore: false, nextPage: null },
      { status: 400 }
    )
  }

  const activity = getActivityById(activityId)
  if (!activity) {
    return Response.json(
      { error: 'Activity not found.', videos: [], hasMore: false, nextPage: null },
      { status: 404 }
    )
  }

  if (page > MAX_RELATED_VIDEO_PAGE) {
    return jsonWithCacheHeaders({ videos: [], hasMore: false, nextPage: null }, 'miss')
  }

  if (forceRefresh && !isAuthorizedRefresh(request, searchParams)) {
    return Response.json(
      { error: 'Unauthorized cache refresh.', videos: [], hasMore: false, nextPage: null },
      { status: 401 }
    )
  }

  const clientKey = getClientKey(request)
  if (!debug && !forceRefresh && isRateLimited(clientKey)) {
    const cached = await getCachedRelatedVideos(activityId, RELATED_VIDEO_ALGORITHM_VERSION)
    if (cached) {
      return jsonWithCacheHeaders(toPagedPayload(cached.entry.videos, page, excludedBvids), cached.state)
    }

    return Response.json(
      {
        error: 'Too many related video requests. Please try again later.',
        videos: [],
        hasMore: false,
        nextPage: null,
      },
      { status: 429 }
    )
  }

  if (debug) {
    try {
      const result = await findRelatedBilibiliVideos(activity, page, excludedBvids, { debug })
      return jsonWithCacheHeaders(result, 'debug')
    } catch (error) {
      return jsonWithCacheHeaders(
        {
          error: error instanceof Error ? error.message : 'Failed to fetch related videos.',
          videos: [],
          hasMore: false,
          nextPage: null,
        },
        'error'
      )
    }
  }

  const cached = await getCachedRelatedVideos(activityId, RELATED_VIDEO_ALGORITHM_VERSION)
  if (cached && cached.state === 'fresh' && !forceRefresh) {
    return jsonWithCacheHeaders(toPagedPayload(cached.entry.videos, page, excludedBvids), 'fresh')
  }

  if (cached && cached.state === 'stale' && !forceRefresh) {
    await triggerBackgroundRefresh(activityId)
    return jsonWithCacheHeaders(toPagedPayload(cached.entry.videos, page, excludedBvids), 'stale')
  }

  const locked = await acquireRefreshLock(activityId, RELATED_VIDEO_ALGORITHM_VERSION)
  if (!locked) {
    const generated = await waitForGeneratedCache(activityId)
    if (generated) {
      return jsonWithCacheHeaders(
        toPagedPayload(generated.entry.videos, page, excludedBvids),
        generated.state
      )
    }

    if (cached) {
      return jsonWithCacheHeaders(toPagedPayload(cached.entry.videos, page, excludedBvids), cached.state)
    }

    return jsonWithCacheHeaders({ videos: [], hasMore: false, nextPage: null }, 'miss')
  }

  try {
    const entry = await refreshActivityCache(activityId, warmPageLimit)
    return jsonWithCacheHeaders(toPagedPayload(entry.videos, page, excludedBvids), 'fresh')
  } catch (error) {
    if (cached) {
      await setCachedRelatedVideos({
        ...cached.entry,
        error: error instanceof Error ? error.message : 'Failed to refresh related videos.',
      })
      return jsonWithCacheHeaders(toPagedPayload(cached.entry.videos, page, excludedBvids), cached.state)
    }

    return jsonWithCacheHeaders(
      {
        error: error instanceof Error ? error.message : 'Failed to fetch related videos.',
        videos: [],
        hasMore: false,
        nextPage: null,
      },
      'error'
    )
  } finally {
    await releaseRefreshLock(activityId, RELATED_VIDEO_ALGORITHM_VERSION)
  }
}
