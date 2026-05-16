import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { BilibiliVideo } from '@/types/activity'

export type RelatedVideoCacheEntry = {
  activityId: string
  algorithmVersion: string
  videos: BilibiliVideo[]
  generatedAt: number
  expiresAt: number
  staleUntil: number
  error?: string
}

type CacheReadResult = {
  entry: RelatedVideoCacheEntry
  state: 'fresh' | 'stale'
}

const CACHE_DIR = path.join(process.cwd(), '.cache', 'bilibili-related-videos')
const LOCK_TTL_MS = 1000 * 60 * 5

const safeCachePart = (value: string): string => value.replace(/[^a-zA-Z0-9._-]/g, '_')

const getCacheFilePath = (algorithmVersion: string, activityId: string): string =>
  path.join(CACHE_DIR, `${safeCachePart(algorithmVersion)}__${safeCachePart(activityId)}.json`)

const getLockFilePath = (algorithmVersion: string, activityId: string): string =>
  path.join(CACHE_DIR, `${safeCachePart(algorithmVersion)}__${safeCachePart(activityId)}.lock`)

const ensureCacheDir = async (): Promise<void> => {
  await mkdir(CACHE_DIR, { recursive: true })
}

const isCacheEntry = (value: unknown): value is RelatedVideoCacheEntry => {
  const entry = value as Partial<RelatedVideoCacheEntry>
  return (
    typeof entry.activityId === 'string' &&
    typeof entry.algorithmVersion === 'string' &&
    Array.isArray(entry.videos) &&
    typeof entry.generatedAt === 'number' &&
    typeof entry.expiresAt === 'number' &&
    typeof entry.staleUntil === 'number'
  )
}

export const getCachedRelatedVideos = async (
  activityId: string,
  algorithmVersion: string
): Promise<CacheReadResult | null> => {
  try {
    const raw = await readFile(getCacheFilePath(algorithmVersion, activityId), 'utf8')
    const entry = JSON.parse(raw) as unknown
    if (!isCacheEntry(entry) || entry.activityId !== activityId || entry.algorithmVersion !== algorithmVersion) {
      return null
    }

    const now = Date.now()
    if (entry.expiresAt > now) {
      return { entry, state: 'fresh' }
    }
    if (entry.staleUntil > now) {
      return { entry, state: 'stale' }
    }

    return null
  } catch {
    return null
  }
}

export const setCachedRelatedVideos = async (
  entry: RelatedVideoCacheEntry
): Promise<void> => {
  await ensureCacheDir()
  const cachePath = getCacheFilePath(entry.algorithmVersion, entry.activityId)
  const tempPath = `${cachePath}.${process.pid}.${Date.now()}.tmp`
  await writeFile(tempPath, JSON.stringify(entry, null, 2), 'utf8')
  await rename(tempPath, cachePath)
}

export const acquireRefreshLock = async (
  activityId: string,
  algorithmVersion: string
): Promise<boolean> => {
  await ensureCacheDir()
  const lockPath = getLockFilePath(algorithmVersion, activityId)
  const now = Date.now()

  try {
    const current = await stat(lockPath)
    if (now - current.mtimeMs <= LOCK_TTL_MS) {
      return false
    }
    await rm(lockPath, { force: true })
  } catch {
    // Missing or unreadable lock files should not block a refresh attempt.
  }

  try {
    await writeFile(lockPath, String(now), { encoding: 'utf8', flag: 'wx' })
    return true
  } catch {
    return false
  }
}

export const releaseRefreshLock = async (
  activityId: string,
  algorithmVersion: string
): Promise<void> => {
  await rm(getLockFilePath(algorithmVersion, activityId), { force: true })
}
