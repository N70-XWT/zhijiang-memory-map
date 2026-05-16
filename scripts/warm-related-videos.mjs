import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const rootDir = process.cwd()
const confirmedActivitiesPath = path.join(rootDir, 'src', 'data', 'confirmedActivities.json')

const SITE_ORIGIN = process.env.SITE_ORIGIN?.replace(/\/$/, '') ?? 'http://127.0.0.1:3000'
const CACHE_WARM_SECRET = process.env.CACHE_WARM_SECRET?.trim()
const WARM_DELAY_MS = Number.parseInt(process.env.WARM_DELAY_MS ?? '30000', 10)
const WARM_PAGE_LIMIT = Number.parseInt(process.env.WARM_PAGE_LIMIT ?? '6', 10)

const sleep = (durationMs) => new Promise((resolve) => setTimeout(resolve, durationMs))

const readActivities = async () => {
  const raw = await readFile(confirmedActivitiesPath, 'utf8')
  const activities = JSON.parse(raw)
  if (!Array.isArray(activities)) {
    throw new Error('confirmedActivities.json must contain an array.')
  }

  return activities.filter((activity) => typeof activity?.id === 'string' && activity.id.length > 0)
}

const warmActivity = async (activityId) => {
  const url = new URL('/api/bilibili/related-videos', SITE_ORIGIN)
  url.searchParams.set('activityId', activityId)
  url.searchParams.set('page', '1')
  url.searchParams.set('refresh', '1')
  url.searchParams.set('algo', 'v8')
  url.searchParams.set('warmPageLimit', String(WARM_PAGE_LIMIT))

  const response = await fetch(url, {
    headers: {
      'x-cache-warm-secret': CACHE_WARM_SECRET,
    },
  })
  const payload = await response.json().catch(() => ({}))

  if (!response.ok || payload.error) {
    throw new Error(payload.error || `Warm request failed with HTTP ${response.status}.`)
  }

  return {
    activityId,
    videos: Array.isArray(payload.videos) ? payload.videos.length : 0,
    hasMore: Boolean(payload.hasMore),
  }
}

if (!CACHE_WARM_SECRET) {
  throw new Error('CACHE_WARM_SECRET is required to warm related video cache.')
}

const activities = await readActivities()
console.log(`Warming related video cache for ${activities.length} activities at ${SITE_ORIGIN}.`)

let succeeded = 0
let failed = 0

for (const [index, activity] of activities.entries()) {
  try {
    const result = await warmActivity(activity.id)
    succeeded += 1
    console.log(
      `[${index + 1}/${activities.length}] ${result.activityId}: ${result.videos} videos${
        result.hasMore ? ' (more cached)' : ''
      }`
    )
  } catch (error) {
    failed += 1
    console.warn(
      `[${index + 1}/${activities.length}] ${activity.id}: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`
    )
  }

  if (index < activities.length - 1 && WARM_DELAY_MS > 0) {
    await sleep(WARM_DELAY_MS)
  }
}

console.log(`Warm complete. succeeded=${succeeded} failed=${failed}`)
if (failed > 0) {
  process.exitCode = 1
}
