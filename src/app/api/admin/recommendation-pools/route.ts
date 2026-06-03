import { extractBvid } from '@/lib/bilibili'
import { getAllActivities, getActivityById } from '@/data/activityRepository'
import {
  createEmptyRelatedVideoPool,
  getRelatedVideoPool,
  isRelatedVideoDisplayTier,
  isRelatedVideoReviewStatus,
  setRelatedVideoPool,
  type PooledRelatedVideo,
  type RelatedVideoDisplayTier,
  type RelatedVideoPoolEntry,
  type RelatedVideoReviewStatus,
} from '@/lib/relatedVideoPool'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const RELATED_VIDEO_POOL_ALGORITHM_VERSION = 'v8-pool-v5'

type PoolSummary = {
  activityId: string
  title: string
  city: string
  date: string
  venue: string
  total: number
  pending: number
  approved: number
  rejected: number
  primary: number
  supplemental: number
  rejectedBvids: number
  lastError?: string
}

const getVideoBvidKey = (video: PooledRelatedVideo): string =>
  (extractBvid(`${video.id} ${video.url}`) ?? video.id) || video.url

const countVideos = (
  videos: PooledRelatedVideo[],
  predicate: (video: PooledRelatedVideo) => boolean
): number => videos.filter(predicate).length

const getPoolSummary = (pool: RelatedVideoPoolEntry | null, activityId: string): PoolSummary => {
  const activity = getActivityById(activityId)
  const videos = pool?.videos ?? []
  return {
    activityId,
    title: activity?.title ?? activityId,
    city: activity?.city ?? '',
    date: activity?.date ?? '',
    venue: activity?.venue ?? '',
    total: videos.length,
    pending: countVideos(videos, (video) => video.reviewStatus === 'pending'),
    approved: countVideos(videos, (video) => video.reviewStatus === 'approved'),
    rejected: countVideos(videos, (video) => video.reviewStatus === 'rejected'),
    primary: countVideos(videos, (video) => video.displayTier === 'primary'),
    supplemental: countVideos(videos, (video) => video.displayTier === 'supplemental'),
    rejectedBvids: pool?.rejectedBvids.length ?? 0,
    lastError: pool?.lastError,
  }
}

const getPoolForActivity = async (activityId: string): Promise<RelatedVideoPoolEntry> =>
  (await getRelatedVideoPool(activityId, RELATED_VIDEO_POOL_ALGORITHM_VERSION)) ??
  createEmptyRelatedVideoPool(activityId, RELATED_VIDEO_POOL_ALGORITHM_VERSION)

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const activityId = searchParams.get('activityId')?.trim()

  if (activityId) {
    const activity = getActivityById(activityId)
    if (!activity) {
      return Response.json({ error: 'Activity not found.' }, { status: 404 })
    }

    const pool = await getPoolForActivity(activityId)
    return Response.json(
      {
        activity,
        pool,
        summary: getPoolSummary(pool, activityId),
      },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    )
  }

  const activities = getAllActivities()
  const summaries = await Promise.all(
    activities.map(async (activity) => {
      const pool = await getRelatedVideoPool(
        activity.id,
        RELATED_VIDEO_POOL_ALGORITHM_VERSION
      )
      return getPoolSummary(pool, activity.id)
    })
  )

  return Response.json(
    {
      algorithmVersion: RELATED_VIDEO_POOL_ALGORITHM_VERSION,
      activities: summaries,
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    }
  )
}

export async function PATCH(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | {
        activityId?: unknown
        bvid?: unknown
        reviewStatus?: unknown
        displayTier?: unknown
        reviewNote?: unknown
      }
    | null

  const activityId = typeof body?.activityId === 'string' ? body.activityId.trim() : ''
  const bvid = typeof body?.bvid === 'string' ? body.bvid.trim() : ''
  const nextReviewStatus: RelatedVideoReviewStatus | undefined =
    body?.reviewStatus === undefined
      ? undefined
      : isRelatedVideoReviewStatus(body.reviewStatus)
        ? body.reviewStatus
        : undefined
  const nextDisplayTier: RelatedVideoDisplayTier | undefined =
    body?.displayTier === undefined
      ? undefined
      : isRelatedVideoDisplayTier(body.displayTier)
        ? body.displayTier
        : undefined

  if (!activityId || !bvid) {
    return Response.json({ error: 'activityId and bvid are required.' }, { status: 400 })
  }
  if (!getActivityById(activityId)) {
    return Response.json({ error: 'Activity not found.' }, { status: 404 })
  }
  if (body?.reviewStatus !== undefined && !nextReviewStatus) {
    return Response.json({ error: 'Invalid reviewStatus.' }, { status: 400 })
  }
  if (body?.displayTier !== undefined && !nextDisplayTier) {
    return Response.json({ error: 'Invalid displayTier.' }, { status: 400 })
  }

  const pool = await getPoolForActivity(activityId)
  const videoIndex = pool.videos.findIndex((video) => getVideoBvidKey(video) === bvid)
  if (videoIndex < 0) {
    return Response.json({ error: 'Video not found in pool.' }, { status: 404 })
  }

  const now = Date.now()
  const nextVideos = [...pool.videos]
  const currentVideo = nextVideos[videoIndex]
  nextVideos[videoIndex] = {
    ...currentVideo,
    reviewStatus: nextReviewStatus ?? currentVideo.reviewStatus,
    displayTier: nextDisplayTier ?? currentVideo.displayTier,
    reviewedAt:
      nextReviewStatus !== undefined || nextDisplayTier !== undefined ? now : currentVideo.reviewedAt,
    reviewNote:
      typeof body?.reviewNote === 'string' ? body.reviewNote.trim() : currentVideo.reviewNote,
  }

  const rejectedBvids = new Set(pool.rejectedBvids)
  if (nextVideos[videoIndex].reviewStatus === 'rejected') {
    rejectedBvids.add(bvid)
  } else {
    rejectedBvids.delete(bvid)
  }

  const nextPool: RelatedVideoPoolEntry = {
    ...pool,
    videos: nextVideos,
    rejectedBvids: Array.from(rejectedBvids),
    updatedAt: now,
  }
  await setRelatedVideoPool(nextPool)

  return Response.json({
    pool: nextPool,
    summary: getPoolSummary(nextPool, activityId),
  })
}
