import {
  discoverStagedRelatedBilibiliVideos,
  extractBvid,
  findRelatedBilibiliVideos,
  type RelatedBilibiliVideoPage,
} from '@/lib/bilibili'
import { getActivityById } from '@/data/activityRepository'
import {
  acquireRelatedVideoPoolLock,
  createInitialRelatedVideoSearchState,
  createEmptyRelatedVideoPool,
  getRelatedVideoPool,
  isRelatedVideoSearchStage,
  RELATED_VIDEO_SEARCH_STAGES,
  releaseRelatedVideoPoolLock,
  setRelatedVideoPool,
  type PooledRelatedVideo,
  type RelatedVideoPoolEntry,
} from '@/lib/relatedVideoPool'
import type { Activity, BilibiliVideo } from '@/types/activity'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type RateLimitBucket = {
  count: number
  resetAt: number
}

const RATE_LIMIT_WINDOW_MS = 1000 * 60
const RATE_LIMIT_MAX_REQUESTS = 30
const MAX_RELATED_VIDEO_PAGE = 6
const RECOMMEND_PAGE_SIZE = 8
const RELATED_VIDEO_POOL_ALGORITHM_VERSION = 'v8-pool-v5'
const RELATED_VIDEO_POOL_TARGET_SIZE = 50
const RELAXED_BACKFILL_SOURCE_STAGE = 'v4_relaxed'
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

const getVideoBvidKey = (video: BilibiliVideo): string =>
  (extractBvid(`${video.id} ${video.url}`) ?? video.id) || video.url

const toPublicBilibiliVideo = (video: BilibiliVideo): BilibiliVideo => ({
  id: video.id,
  title: video.title,
  cover: video.cover,
  url: video.url,
  sourceType: video.sourceType,
  note: video.note,
})

const getApprovedPoolVideos = (pool: RelatedVideoPoolEntry): BilibiliVideo[] => {
  const approvedVideos = pool.videos.filter((video) => video.reviewStatus === 'approved')
  const primaryVideos = approvedVideos.filter((video) => video.displayTier === 'primary')
  const supplementalVideos = approvedVideos.filter((video) => video.displayTier === 'supplemental')
  return [...primaryVideos, ...supplementalVideos].map(toPublicBilibiliVideo)
}

const toPoolPagedPayload = (
  pool: RelatedVideoPoolEntry,
  page: number,
  excludedBvids: Set<string>
): RelatedBilibiliVideoPage => {
  const startIndex = (page - 1) * RECOMMEND_PAGE_SIZE
  const visibleVideos = getApprovedPoolVideos(pool)
  const selected: BilibiliVideo[] = []
  let cursor = startIndex

  while (cursor < visibleVideos.length && selected.length < RECOMMEND_PAGE_SIZE) {
    const video = visibleVideos[cursor]
    if (video && !excludedBvids.has(getVideoBvidKey(video))) {
      selected.push(video)
    }
    cursor += 1
  }

  const hasStoredMore = visibleVideos
    .slice(cursor)
    .some((video) => !excludedBvids.has(getVideoBvidKey(video)))
  const canExpandMore = !pool.exhausted && pool.videos.length < RELATED_VIDEO_POOL_TARGET_SIZE
  const hasMore = hasStoredMore || canExpandMore

  return {
    videos: selected,
    hasMore,
    nextPage: hasMore
      ? selected.length < RECOMMEND_PAGE_SIZE && !hasStoredMore
        ? page
        : page + 1
      : null,
  }
}

const isRelatedVideoPoolEnabled = (): boolean =>
  process.env.RELATED_VIDEO_POOL_ENABLED !== '0'

const mergePoolVideos = (
  currentVideos: PooledRelatedVideo[],
  nextVideos: PooledRelatedVideo[],
  excludedBvids: Set<string>
): PooledRelatedVideo[] => {
  const usedBvids = new Set(currentVideos.map(getVideoBvidKey).filter(Boolean))
  const merged = [...currentVideos]

  for (const video of nextVideos) {
    const key = getVideoBvidKey(video)
    if (!key || usedBvids.has(key) || excludedBvids.has(key)) {
      continue
    }

    usedBvids.add(key)
    merged.push(video)
  }

  return merged
}

const toRelaxedBackfillVideo = (video: BilibiliVideo): PooledRelatedVideo => ({
  ...video,
  note: video.note ?? '待审核：宽松候选补量',
  reviewStatus: 'pending',
  displayTier: 'supplemental',
  sourceStage: RELAXED_BACKFILL_SOURCE_STAGE,
  relevanceScore: 0,
  reviewNote: '宽松候选，待人工审核',
})

const waitForRelatedVideoPool = async (
  activityId: string
): Promise<RelatedVideoPoolEntry | null> => {
  for (let attempt = 0; attempt < CACHE_WAIT_RETRY_COUNT; attempt += 1) {
    await sleep(CACHE_WAIT_RETRY_MS)
    const pool = await getRelatedVideoPool(activityId, RELATED_VIDEO_POOL_ALGORITHM_VERSION)
    if (pool) {
      return pool
    }
  }

  return null
}

const expandRelatedVideoPool = async (
  activity: Activity,
  activityId: string,
  excludedBvids: Set<string>,
  allowExhaustedRetry: boolean
): Promise<RelatedVideoPoolEntry> => {
  let current =
    (await getRelatedVideoPool(activityId, RELATED_VIDEO_POOL_ALGORITHM_VERSION)) ??
    createEmptyRelatedVideoPool(activityId, RELATED_VIDEO_POOL_ALGORITHM_VERSION)

  if (
    current.exhausted &&
    current.videos.length >= RELATED_VIDEO_POOL_TARGET_SIZE &&
    !allowExhaustedRetry
  ) {
    return current
  }

  if (current.exhausted && allowExhaustedRetry) {
    current = {
      ...current,
      searchCursor: 1,
      searchState: createInitialRelatedVideoSearchState(),
      relaxedSearchCursor: 1,
      relaxedExhausted: false,
      exhausted: false,
    }
  }

  const poolBvids = new Set(current.videos.map(getVideoBvidKey).filter(Boolean))
  const rejectedBvids = new Set(current.rejectedBvids.filter(Boolean))
  const searchExcludedBvids = new Set([...excludedBvids, ...poolBvids, ...rejectedBvids])
  let workingPool = current

  try {
    while (!workingPool.exhausted) {
      const searchState = workingPool.searchState ?? createInitialRelatedVideoSearchState()
      const stage = searchState.stage
      const searchCursor = Math.max(1, Math.floor(searchState.pageByStage[stage] || 1))
      const result = await discoverStagedRelatedBilibiliVideos(
        activity,
        stage,
        searchCursor,
        searchExcludedBvids
      )
      const mergedVideos = mergePoolVideos(
        workingPool.videos,
        result.videos,
        new Set([...excludedBvids, ...workingPool.rejectedBvids])
      )
      const foundNewVideos = mergedVideos.length > workingPool.videos.length
      for (const video of mergedVideos) {
        searchExcludedBvids.add(getVideoBvidKey(video))
      }

      const exhaustedStages = result.stageExhausted
        ? Array.from(new Set([...searchState.exhaustedStages, stage]))
        : searchState.exhaustedStages
      const nextStage = RELATED_VIDEO_SEARCH_STAGES.find(
        (candidateStage) => !exhaustedStages.includes(candidateStage)
      )
      const exhausted = !nextStage
      const nextSearchState = {
        stage: nextStage ?? stage,
        pageByStage: {
          ...searchState.pageByStage,
          [stage]: result.nextPage,
        },
        exhaustedStages,
      }

      workingPool = {
        ...workingPool,
        videos: mergedVideos,
        searchCursor: result.nextPage,
        searchState: nextSearchState,
        exhausted,
        updatedAt: Date.now(),
        lastError: undefined,
      }

      if (foundNewVideos || exhausted || !result.stageExhausted) {
        break
      }
    }

    if (
      workingPool.videos.length < RELATED_VIDEO_POOL_TARGET_SIZE &&
      !workingPool.relaxedExhausted
    ) {
      const relaxedPage = Math.max(1, Math.floor(workingPool.relaxedSearchCursor || 1))
      const result = await findRelatedBilibiliVideos(activity, relaxedPage, searchExcludedBvids, {
        relaxed: true,
        includeSeedRelated: false,
        recommendLimit: RELATED_VIDEO_POOL_TARGET_SIZE - workingPool.videos.length,
      })
      const relaxedVideos = result.videos.map(toRelaxedBackfillVideo)
      const mergedVideos = mergePoolVideos(
        workingPool.videos,
        relaxedVideos,
        new Set([...excludedBvids, ...workingPool.rejectedBvids])
      )
      const relaxedExhausted = !result.hasMore
      workingPool = {
        ...workingPool,
        videos: mergedVideos,
        relaxedSearchCursor: result.nextPage ?? relaxedPage + 1,
        relaxedExhausted,
        exhausted:
          mergedVideos.length >= RELATED_VIDEO_POOL_TARGET_SIZE
            ? true
            : workingPool.exhausted && relaxedExhausted,
        updatedAt: Date.now(),
        lastError: undefined,
      }
    }

    await setRelatedVideoPool(workingPool)
    return workingPool
  } catch (error) {
    const failedPool: RelatedVideoPoolEntry = {
      ...workingPool,
      updatedAt: Date.now(),
      lastError:
        error instanceof Error ? error.message : 'Failed to expand related video pool.',
    }
    await setRelatedVideoPool(failedPool)
    throw error
  }
}

const handleRelatedVideoPoolRequest = async (
  activity: Activity,
  activityId: string,
  page: number,
  excludedBvids: Set<string>,
  forceRefresh: boolean,
  warmPageLimit: number
): Promise<RelatedBilibiliVideoPage> => {
  let pool =
    (await getRelatedVideoPool(activityId, RELATED_VIDEO_POOL_ALGORITHM_VERSION)) ??
    createEmptyRelatedVideoPool(activityId, RELATED_VIDEO_POOL_ALGORITHM_VERSION)
  let payload = toPoolPagedPayload(pool, page, excludedBvids)
  const expansionAttempts = forceRefresh ? warmPageLimit : 1
  const needsCandidateBackfill = pool.videos.length < RELATED_VIDEO_POOL_TARGET_SIZE
  const shouldExpand =
    forceRefresh ||
    needsCandidateBackfill ||
    (payload.videos.length < RECOMMEND_PAGE_SIZE &&
      !pool.exhausted &&
      pool.videos.length < RELATED_VIDEO_POOL_TARGET_SIZE)

  if (!shouldExpand) {
    return payload
  }

  const locked = await acquireRelatedVideoPoolLock(activityId, RELATED_VIDEO_POOL_ALGORITHM_VERSION)
  if (!locked) {
    const generated = await waitForRelatedVideoPool(activityId)
    return toPoolPagedPayload(generated ?? pool, page, excludedBvids)
  }

  try {
    for (let attempt = 0; attempt < expansionAttempts; attempt += 1) {
      pool = await expandRelatedVideoPool(activity, activityId, excludedBvids, forceRefresh)
      payload = toPoolPagedPayload(pool, page, excludedBvids)
      if (!forceRefresh && (payload.videos.length >= RECOMMEND_PAGE_SIZE || pool.exhausted)) {
        break
      }
      if (forceRefresh && pool.exhausted) {
        break
      }
    }

    return toPoolPagedPayload(pool, page, excludedBvids)
  } finally {
    await releaseRelatedVideoPoolLock(activityId, RELATED_VIDEO_POOL_ALGORITHM_VERSION)
  }
}

const jsonWithCacheHeaders = (
  payload: RelatedBilibiliVideoPage,
  cacheState: 'pool' | 'miss' | 'debug' | 'error'
) =>
  Response.json(payload, {
    headers: {
      'Cache-Control': 'no-store',
      'X-Related-Video-Algorithm': RELATED_VIDEO_POOL_ALGORITHM_VERSION,
      'X-Related-Video-Cache': cacheState,
    },
  })

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
  const rawDebugStage = searchParams.get('stage')
  const debugStage = isRelatedVideoSearchStage(rawDebugStage) ? rawDebugStage : null
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

  const poolEnabled = isRelatedVideoPoolEnabled()

  if (!poolEnabled && page > MAX_RELATED_VIDEO_PAGE) {
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
    if (poolEnabled) {
      const pool = await getRelatedVideoPool(activityId, RELATED_VIDEO_POOL_ALGORITHM_VERSION)
      if (pool) {
        return jsonWithCacheHeaders(toPoolPagedPayload(pool, page, excludedBvids), 'pool')
      }
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
      if (debugStage) {
        const result = await discoverStagedRelatedBilibiliVideos(
          activity,
          debugStage,
          page,
          excludedBvids,
          { debug: true }
        )
        return jsonWithCacheHeaders(
          {
            videos: result.videos,
            hasMore: false,
            nextPage: null,
            debug: result.debug,
          },
          'debug'
        )
      }

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

  if (poolEnabled && !debug) {
    try {
      const result = await handleRelatedVideoPoolRequest(
        activity,
        activityId,
        page,
        excludedBvids,
        forceRefresh,
        warmPageLimit
      )
      return jsonWithCacheHeaders(result, 'pool')
    } catch (error) {
      return jsonWithCacheHeaders(
        {
          error:
            error instanceof Error ? error.message : 'Failed to fetch related videos from pool.',
          videos: [],
          hasMore: false,
          nextPage: null,
        },
        'error'
      )
    }
  }

  try {
    const result = await findRelatedBilibiliVideos(activity, page, excludedBvids)
    return jsonWithCacheHeaders(result, 'miss')
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
