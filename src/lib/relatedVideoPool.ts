import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import seedRelatedVideoPoolsV5 from '@/data/recommendationPools/v8-pool-v5/index.json'
import type { BilibiliVideo } from '@/types/activity'

export const RELATED_VIDEO_SEARCH_STAGES = [
  'member_activity',
  'date_activity',
  'live_activity',
  'post_event_live',
] as const

export type RelatedVideoSearchStage = (typeof RELATED_VIDEO_SEARCH_STAGES)[number]

export type RelatedVideoSearchState = {
  stage: RelatedVideoSearchStage
  pageByStage: Record<RelatedVideoSearchStage, number>
  exhaustedStages: RelatedVideoSearchStage[]
}

export type RelatedVideoReviewStatus = 'pending' | 'approved' | 'rejected'
export type RelatedVideoDisplayTier = 'primary' | 'supplemental'

export type PooledRelatedVideo = BilibiliVideo & {
  reviewStatus: RelatedVideoReviewStatus
  displayTier: RelatedVideoDisplayTier
  sourceStage: string
  relevanceScore: number
  reviewedAt?: number
  reviewNote?: string
}

export type RelatedVideoPoolEntry = {
  activityId: string
  algorithmVersion: string
  videos: PooledRelatedVideo[]
  rejectedBvids: string[]
  searchCursor: number
  searchState?: RelatedVideoSearchState
  relaxedSearchCursor?: number
  relaxedExhausted?: boolean
  exhausted: boolean
  generatedAt: number
  updatedAt: number
  lastError?: string
}

const POOL_DIR = process.env.RELATED_VIDEO_CACHE_DIR?.trim() || (
  process.env.VERCEL
    ? path.join(os.tmpdir(), 'zhijiang-memory-map', 'bilibili-related-videos')
    : path.join(process.cwd(), '.cache', 'bilibili-related-videos')
)
const LOCK_TTL_MS = 1000 * 60 * 5
const SEED_RELATED_VIDEO_POOLS_BY_VERSION: Record<string, unknown[]> = {
  'v8-pool-v5': seedRelatedVideoPoolsV5 as unknown[],
}

const safePoolPart = (value: string): string => value.replace(/[^a-zA-Z0-9._-]/g, '_')

const getPoolFilePath = (algorithmVersion: string, activityId: string): string =>
  path.join(POOL_DIR, `pool__${safePoolPart(algorithmVersion)}__${safePoolPart(activityId)}.json`)

const getPoolLockFilePath = (algorithmVersion: string, activityId: string): string =>
  path.join(POOL_DIR, `pool__${safePoolPart(algorithmVersion)}__${safePoolPart(activityId)}.lock`)

const ensurePoolDir = async (): Promise<void> => {
  await mkdir(POOL_DIR, { recursive: true })
}

export const createInitialRelatedVideoSearchState = (): RelatedVideoSearchState => ({
  stage: RELATED_VIDEO_SEARCH_STAGES[0],
  pageByStage: {
    member_activity: 1,
    date_activity: 1,
    live_activity: 1,
    post_event_live: 1,
  },
  exhaustedStages: [],
})

export const isRelatedVideoSearchStage = (value: unknown): value is RelatedVideoSearchStage =>
  RELATED_VIDEO_SEARCH_STAGES.includes(value as RelatedVideoSearchStage)

const isRelatedVideoSearchState = (value: unknown): value is RelatedVideoSearchState => {
  const state = value as Partial<RelatedVideoSearchState>
  return (
    isRelatedVideoSearchStage(state.stage) &&
    typeof state.pageByStage === 'object' &&
    state.pageByStage !== null &&
    RELATED_VIDEO_SEARCH_STAGES.every(
      (stage) => typeof state.pageByStage?.[stage] === 'number'
    ) &&
    Array.isArray(state.exhaustedStages) &&
    state.exhaustedStages.every(isRelatedVideoSearchStage)
  )
}

export const isRelatedVideoReviewStatus = (
  value: unknown
): value is RelatedVideoReviewStatus =>
  value === 'pending' || value === 'approved' || value === 'rejected'

export const isRelatedVideoDisplayTier = (value: unknown): value is RelatedVideoDisplayTier =>
  value === 'primary' || value === 'supplemental'

const toPooledRelatedVideo = (video: BilibiliVideo): PooledRelatedVideo => {
  const candidate = video as Partial<PooledRelatedVideo>
  return {
    ...video,
    reviewStatus: isRelatedVideoReviewStatus(candidate.reviewStatus)
      ? candidate.reviewStatus
      : 'approved',
    displayTier: isRelatedVideoDisplayTier(candidate.displayTier)
      ? candidate.displayTier
      : 'primary',
    sourceStage: typeof candidate.sourceStage === 'string' ? candidate.sourceStage : video.note ?? 'legacy',
    relevanceScore:
      typeof candidate.relevanceScore === 'number' && Number.isFinite(candidate.relevanceScore)
        ? candidate.relevanceScore
        : 0,
    reviewedAt: typeof candidate.reviewedAt === 'number' ? candidate.reviewedAt : undefined,
    reviewNote: typeof candidate.reviewNote === 'string' ? candidate.reviewNote : undefined,
  }
}

const isRelatedVideoPoolEntry = (value: unknown): value is RelatedVideoPoolEntry => {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const entry = value as Partial<RelatedVideoPoolEntry>
  return (
    typeof entry.activityId === 'string' &&
    typeof entry.algorithmVersion === 'string' &&
    Array.isArray(entry.videos) &&
    (entry.rejectedBvids === undefined || Array.isArray(entry.rejectedBvids)) &&
    typeof entry.searchCursor === 'number' &&
    (entry.searchState === undefined || isRelatedVideoSearchState(entry.searchState)) &&
    (entry.relaxedSearchCursor === undefined || typeof entry.relaxedSearchCursor === 'number') &&
    (entry.relaxedExhausted === undefined || typeof entry.relaxedExhausted === 'boolean') &&
    typeof entry.exhausted === 'boolean' &&
    typeof entry.generatedAt === 'number' &&
    typeof entry.updatedAt === 'number'
  )
}

const getSeedRelatedVideoPool = (
  activityId: string,
  algorithmVersion: string
): RelatedVideoPoolEntry | null => {
  const seedEntries = SEED_RELATED_VIDEO_POOLS_BY_VERSION[algorithmVersion] ?? []
  const seedEntry = seedEntries.find((value) => {
    const entry = value as Partial<RelatedVideoPoolEntry>
    return entry.activityId === activityId && entry.algorithmVersion === algorithmVersion
  })

  return isRelatedVideoPoolEntry(seedEntry)
    ? {
        ...seedEntry,
        videos: seedEntry.videos.map(toPooledRelatedVideo),
        rejectedBvids: Array.isArray(seedEntry.rejectedBvids) ? seedEntry.rejectedBvids : [],
        relaxedSearchCursor:
          typeof seedEntry.relaxedSearchCursor === 'number' &&
          Number.isFinite(seedEntry.relaxedSearchCursor)
            ? seedEntry.relaxedSearchCursor
            : 1,
        relaxedExhausted: Boolean(seedEntry.relaxedExhausted),
      }
    : null
}

export const createEmptyRelatedVideoPool = (
  activityId: string,
  algorithmVersion: string
): RelatedVideoPoolEntry => {
  const now = Date.now()
  return {
    activityId,
    algorithmVersion,
    videos: [],
    rejectedBvids: [],
    searchCursor: 1,
    searchState: createInitialRelatedVideoSearchState(),
    relaxedSearchCursor: 1,
    relaxedExhausted: false,
    exhausted: false,
    generatedAt: now,
    updatedAt: now,
  }
}

export const getRelatedVideoPool = async (
  activityId: string,
  algorithmVersion: string
): Promise<RelatedVideoPoolEntry | null> => {
  try {
    const raw = await readFile(getPoolFilePath(algorithmVersion, activityId), 'utf8')
    const entry = JSON.parse(raw) as unknown
    if (
      !isRelatedVideoPoolEntry(entry) ||
      entry.activityId !== activityId ||
      entry.algorithmVersion !== algorithmVersion
    ) {
      return getSeedRelatedVideoPool(activityId, algorithmVersion)
    }

    return {
      ...entry,
      videos: entry.videos.map(toPooledRelatedVideo),
      rejectedBvids: Array.isArray(entry.rejectedBvids) ? entry.rejectedBvids : [],
      relaxedSearchCursor:
        typeof entry.relaxedSearchCursor === 'number' && Number.isFinite(entry.relaxedSearchCursor)
          ? entry.relaxedSearchCursor
          : 1,
      relaxedExhausted: Boolean(entry.relaxedExhausted),
    }
  } catch {
    return getSeedRelatedVideoPool(activityId, algorithmVersion)
  }
}

export const setRelatedVideoPool = async (entry: RelatedVideoPoolEntry): Promise<void> => {
  await ensurePoolDir()
  const poolPath = getPoolFilePath(entry.algorithmVersion, entry.activityId)
  const tempPath = `${poolPath}.${process.pid}.${Date.now()}.tmp`
  await writeFile(tempPath, JSON.stringify(entry, null, 2), 'utf8')
  await rename(tempPath, poolPath)
}

export const acquireRelatedVideoPoolLock = async (
  activityId: string,
  algorithmVersion: string
): Promise<boolean> => {
  await ensurePoolDir()
  const lockPath = getPoolLockFilePath(algorithmVersion, activityId)
  const now = Date.now()

  try {
    const current = await stat(lockPath)
    if (now - current.mtimeMs <= LOCK_TTL_MS) {
      return false
    }
    await rm(lockPath, { force: true })
  } catch {
    // Missing or unreadable lock files should not block a pool expansion attempt.
  }

  try {
    await writeFile(lockPath, String(now), { encoding: 'utf8', flag: 'wx' })
    return true
  } catch {
    return false
  }
}

export const releaseRelatedVideoPoolLock = async (
  activityId: string,
  algorithmVersion: string
): Promise<void> => {
  await rm(getPoolLockFilePath(algorithmVersion, activityId), { force: true })
}
