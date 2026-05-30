import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import seedRelatedVideoPools from '@/data/recommendationPools/v8-pool-v3/index.json'
import type { BilibiliVideo } from '@/types/activity'

export type RelatedVideoPoolEntry = {
  activityId: string
  algorithmVersion: string
  videos: BilibiliVideo[]
  searchCursor: number
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

const safePoolPart = (value: string): string => value.replace(/[^a-zA-Z0-9._-]/g, '_')

const getPoolFilePath = (algorithmVersion: string, activityId: string): string =>
  path.join(POOL_DIR, `pool__${safePoolPart(algorithmVersion)}__${safePoolPart(activityId)}.json`)

const getPoolLockFilePath = (algorithmVersion: string, activityId: string): string =>
  path.join(POOL_DIR, `pool__${safePoolPart(algorithmVersion)}__${safePoolPart(activityId)}.lock`)

const ensurePoolDir = async (): Promise<void> => {
  await mkdir(POOL_DIR, { recursive: true })
}

const isRelatedVideoPoolEntry = (value: unknown): value is RelatedVideoPoolEntry => {
  const entry = value as Partial<RelatedVideoPoolEntry>
  return (
    typeof entry.activityId === 'string' &&
    typeof entry.algorithmVersion === 'string' &&
    Array.isArray(entry.videos) &&
    typeof entry.searchCursor === 'number' &&
    typeof entry.exhausted === 'boolean' &&
    typeof entry.generatedAt === 'number' &&
    typeof entry.updatedAt === 'number'
  )
}

const getSeedRelatedVideoPool = (
  activityId: string,
  algorithmVersion: string
): RelatedVideoPoolEntry | null => {
  const seedEntry = (seedRelatedVideoPools as unknown[]).find((value) => {
    const entry = value as Partial<RelatedVideoPoolEntry>
    return entry.activityId === activityId && entry.algorithmVersion === algorithmVersion
  })

  return isRelatedVideoPoolEntry(seedEntry) ? seedEntry : null
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
    searchCursor: 1,
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

    return entry
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
