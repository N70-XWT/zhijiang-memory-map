import { findRelatedBilibiliVideos } from '@/lib/bilibili'
import { getActivityById } from '@/data/activityRepository'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type RelatedVideosPayload = Awaited<ReturnType<typeof findRelatedBilibiliVideos>>

type CachedResponse = {
  expiresAt: number
  payload: RelatedVideosPayload
}

type RateLimitBucket = {
  count: number
  resetAt: number
}

const CACHE_TTL_MS = 1000 * 60 * 60 * 24
const RATE_LIMIT_WINDOW_MS = 1000 * 60
const RATE_LIMIT_MAX_REQUESTS = 30
const MAX_RELATED_VIDEO_PAGE = 3

const responseCache = new Map<string, CachedResponse>()
const rateLimitBuckets = new Map<string, RateLimitBucket>()

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

const getCacheKey = (activityId: string, page: number, exclude: string): string =>
  `${activityId}:${page}:${exclude}`

const jsonWithCacheHeaders = (payload: RelatedVideosPayload) =>
  Response.json(payload, {
    headers: {
      'Cache-Control': 's-maxage=86400, stale-while-revalidate=604800',
    },
  })

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const activityId = searchParams.get('activityId')?.trim()
  const rawPage = Number.parseInt(searchParams.get('page') ?? '1', 10)
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1
  const debug = searchParams.get('debug') === '1' && process.env.NODE_ENV !== 'production'
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
    return Response.json({ videos: [], hasMore: false, nextPage: null })
  }

  const clientKey = getClientKey(request)
  if (!debug && isRateLimited(clientKey)) {
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

  const cacheKey = getCacheKey(activityId, page, excludedBvidList.sort().join(','))
  const cached = responseCache.get(cacheKey)
  if (!debug && cached && cached.expiresAt > Date.now()) {
    return jsonWithCacheHeaders(cached.payload)
  }

  try {
    const result = await findRelatedBilibiliVideos(activity, page, excludedBvids, { debug })
    if (!debug) {
      responseCache.set(cacheKey, {
        expiresAt: Date.now() + CACHE_TTL_MS,
        payload: result,
      })
    }
    return jsonWithCacheHeaders(result)
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : 'Failed to fetch related videos.',
        videos: [],
        hasMore: false,
        nextPage: null,
      },
      { status: 200 }
    )
  }
}
