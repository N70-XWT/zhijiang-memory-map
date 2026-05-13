import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

const loadEnvLocal = async () => {
  const envPath = path.join(rootDir, '.env.local')

  try {
    const content = await readFile(envPath, 'utf8')
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) {
        continue
      }

      const separatorIndex = trimmed.indexOf('=')
      if (separatorIndex === -1) {
        continue
      }

      const key = trimmed.slice(0, separatorIndex).trim()
      const rawValue = trimmed.slice(separatorIndex + 1).trim()
      const value = rawValue.replace(/^['"]|['"]$/g, '')

      if (key && process.env[key] === undefined) {
        process.env[key] = value
      }
    }
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error
    }
  }
}

await loadEnvLocal()

const TARGET_UIDS = ['703007996', '672353429', '672328094', '672342685']
const MONTHS_TO_SCAN = Number.parseInt(process.env.BILIBILI_SCAN_MONTHS ?? '18', 10)
const PAGE_SIZE = Number.parseInt(process.env.BILIBILI_PAGE_SIZE ?? '10', 10)
const MAX_VIDEO_PAGES_PER_UID = Number.parseInt(process.env.BILIBILI_VIDEO_PAGES ?? '1', 10)
const MAX_DYNAMIC_PAGES_PER_UID = Number.parseInt(process.env.BILIBILI_DYNAMIC_PAGES ?? '1', 10)
const REQUEST_DELAY_MS = Number.parseInt(process.env.BILIBILI_REQUEST_DELAY_MS ?? '15000', 10)
const REQUEST_JITTER_MS = Number.parseInt(process.env.BILIBILI_REQUEST_JITTER_MS ?? '5000', 10)
const ACCOUNT_DELAY_MS = Number.parseInt(process.env.BILIBILI_ACCOUNT_DELAY_MS ?? '60000', 10)

const candidatesPath = path.join(rootDir, 'src', 'data', 'activityCandidates.json')
const venueCoordinatesPath = path.join(rootDir, 'src', 'data', 'venueCoordinates.json')

const EVENT_KEYWORDS = [
  '线下',
  '见面会',
  'live',
  'Live',
  'LIVE',
  '巡演',
  '展演',
  '活动',
  '应援',
  '签售',
  '场馆',
  '舞台',
  '专场',
  '快闪',
  '嘉年华',
  '演唱会'
]

const CITY_NAMES = [
  '北京',
  '上海',
  '广州',
  '深圳',
  '杭州',
  '南京',
  '成都',
  '重庆',
  '武汉',
  '西安',
  '长沙',
  '苏州',
  '天津',
  '青岛',
  '厦门',
  '合肥',
  '郑州',
  '宁波',
  '无锡',
  '佛山',
]

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const getDelayWithJitter = (baseMs) => {
  if (REQUEST_JITTER_MS <= 0) {
    return baseMs
  }

  return baseMs + Math.floor(Math.random() * REQUEST_JITTER_MS)
}

const sleepWithJitter = (baseMs) => sleep(getDelayWithJitter(baseMs))

class BilibiliRiskError extends Error {
  constructor(message) {
    super(message)
    this.name = 'BilibiliRiskError'
  }
}

const readJson = async (filePath, fallback) => {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') {
      return fallback
    }
    throw error
  }
}

const writeJson = async (filePath, value) => {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

const fetchJson = async (url) => {
  const headers = {
    accept: 'application/json, text/plain, */*',
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.7',
    referer: 'https://www.bilibili.com/',
    'user-agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  }

  if (process.env.BILIBILI_COOKIE) {
    headers.cookie = process.env.BILIBILI_COOKIE
  }

  const response = await fetch(url, { headers })
  if (!response.ok) {
    if (response.status === 412 || response.status === 429) {
      throw new BilibiliRiskError(`HTTP ${response.status} ${response.statusText}`)
    }
    throw new Error(`HTTP ${response.status} ${response.statusText}`)
  }

  const payload = await response.json()
  if (payload.code !== 0) {
    if (payload.code === -799 || payload.code === -352 || payload.code === -412) {
      throw new BilibiliRiskError(
        `Bilibili code ${payload.code}: ${payload.message ?? 'risk control or rate limit'}`
      )
    }
    throw new Error(`Bilibili code ${payload.code}: ${payload.message ?? 'unknown error'}`)
  }

  return payload
}

const stripHtml = (value) =>
  String(value ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const getCutoffTimestamp = () => {
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - MONTHS_TO_SCAN)
  return Math.floor(cutoff.getTime() / 1000)
}

const detectKeywords = (text) =>
  EVENT_KEYWORDS.filter((keyword) => text.includes(keyword))

const detectDate = (text, publishedAt) => {
  const normalized = text.replace(/[年月.]/g, '-').replace(/日/g, '')
  const explicitDate = normalized.match(/(20\d{2})[-/](\d{1,2})[-/](\d{1,2})/)
  if (explicitDate) {
    const [, year, month, day] = explicitDate
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  const monthDay = normalized.match(/(?<!\d)(\d{1,2})[-/](\d{1,2})(?!\d)/)
  if (monthDay && publishedAt) {
    const year = new Date(publishedAt * 1000).getFullYear()
    const [, month, day] = monthDay
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  return undefined
}

const detectCity = (text) => CITY_NAMES.find((city) => text.includes(city))

const detectVenue = (text) => {
  const candidates = [
    /(?:地点|场地|场馆|地址|Venue)[:：\s]*([^\n，,。；;]{4,32})/i,
    /([\u4e00-\u9fa5A-Za-z0-9·（）()]{2,24}(?:剧场|剧院|体育馆|体育场|艺术中心|文化中心|展览中心|会展中心|演艺中心|音乐厅|影城|广场|Livehouse|LIVEHOUSE|馆|厅|中心))/,
  ]

  for (const pattern of candidates) {
    const match = text.match(pattern)
    if (match?.[1]) {
      return match[1].trim()
    }
  }

  return undefined
}

const buildVenueLookup = (venueCoordinates) =>
  new Set(
    venueCoordinates.flatMap((venue) => [
      `${venue.city}::${venue.name}`,
      ...(venue.aliases ?? []).map((alias) => `${venue.city}::${alias}`),
    ])
  )

const hasKnownVenueCoordinate = (venueLookup, city, venue) => {
  if (!city || !venue) {
    return false
  }
  return venueLookup.has(`${city}::${venue}`)
}

const toCandidate = (item, venueLookup) => {
  const rawTitle = stripHtml(item.rawTitle)
  const rawText = stripHtml(item.rawText)
  const searchText = `${rawTitle} ${rawText}`
  const matchedKeywords = detectKeywords(searchText)

  if (matchedKeywords.length === 0) {
    return undefined
  }

  const detectedDate = detectDate(searchText, item.publishedAt)
  const detectedCity = detectCity(searchText)
  const detectedVenue = detectVenue(searchText)
  const status = hasKnownVenueCoordinate(venueLookup, detectedCity, detectedVenue)
    ? 'candidate'
    : 'needs_venue'

  return {
    id: `${item.sourceType}-${item.sourceId}`,
    sourceUid: item.sourceUid,
    sourceType: item.sourceType,
    sourceId: item.sourceId,
    sourceUrl: item.sourceUrl,
    rawTitle,
    rawText,
    publishedAt: item.publishedAt
      ? new Date(item.publishedAt * 1000).toISOString()
      : undefined,
    matchedKeywords,
    detectedDate,
    detectedCity,
    detectedVenue,
    status,
    crawledAt: new Date().toISOString(),
  }
}

const crawlVideosForUid = async (uid, cutoffTimestamp) => {
  const results = []

  for (let page = 1; page <= MAX_VIDEO_PAGES_PER_UID; page += 1) {
    const url = new URL('https://api.bilibili.com/x/space/arc/search')
    url.searchParams.set('mid', uid)
    url.searchParams.set('ps', String(PAGE_SIZE))
    url.searchParams.set('pn', String(page))
    url.searchParams.set('order', 'pubdate')

    const payload = await fetchJson(url)
    const videos = payload.data?.list?.vlist ?? []

    for (const video of videos) {
      if (video.created && video.created < cutoffTimestamp) {
        continue
      }

      results.push({
        sourceUid: uid,
        sourceType: 'video',
        sourceId: video.bvid || String(video.aid),
        sourceUrl: video.bvid
          ? `https://www.bilibili.com/video/${video.bvid}`
          : `https://www.bilibili.com/video/av${video.aid}`,
        rawTitle: video.title,
        rawText: video.description,
        publishedAt: video.created,
      })
    }

    if (videos.length < PAGE_SIZE) {
      break
    }

    await sleepWithJitter(REQUEST_DELAY_MS)
  }

  return results
}

const extractDynamicText = (item) => {
  const moduleDynamic = item.modules?.module_dynamic
  const descText = item.modules?.module_author?.pub_action ?? ''
  const major = moduleDynamic?.major
  const archive = major?.archive
  const opus = major?.opus

  return stripHtml(
    [
      moduleDynamic?.desc?.text,
      archive?.title,
      archive?.desc,
      opus?.summary?.text,
      descText,
    ]
      .filter(Boolean)
      .join(' ')
  )
}

const crawlDynamicsForUid = async (uid, cutoffTimestamp) => {
  const results = []
  let offset = ''

  for (let page = 1; page <= MAX_DYNAMIC_PAGES_PER_UID; page += 1) {
    const url = new URL('https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space')
    url.searchParams.set('host_mid', uid)
    url.searchParams.set('timezone_offset', '-480')
    if (offset) {
      url.searchParams.set('offset', offset)
    }

    const payload = await fetchJson(url)
    const items = payload.data?.items ?? []

    for (const item of items) {
      const timestamp = item.modules?.module_author?.pub_ts
      if (timestamp && timestamp < cutoffTimestamp) {
        continue
      }

      const sourceId = item.id_str || item.basic?.comment_id_str
      if (!sourceId) {
        continue
      }

      const dynamicText = extractDynamicText(item)
      results.push({
        sourceUid: uid,
        sourceType: 'dynamic',
        sourceId,
        sourceUrl: `https://t.bilibili.com/${sourceId}`,
        rawTitle: dynamicText.slice(0, 60) || `动态 ${sourceId}`,
        rawText: dynamicText,
        publishedAt: timestamp,
      })
    }

    if (!payload.data?.has_more || !payload.data?.offset) {
      break
    }

    offset = payload.data.offset
    await sleepWithJitter(REQUEST_DELAY_MS)
  }

  return results
}

const mergeCandidates = (existing, incoming) => {
  const byKey = new Map()

  for (const candidate of existing) {
    const key = candidate.sourceId || candidate.sourceUrl || candidate.id
    if (key) {
      byKey.set(key, candidate)
    }
  }

  for (const candidate of incoming) {
    const key = candidate.sourceId || candidate.sourceUrl || candidate.id
    if (!key) {
      continue
    }

    byKey.set(key, {
      ...byKey.get(key),
      ...candidate,
    })
  }

  return Array.from(byKey.values()).sort((a, b) =>
    String(b.publishedAt ?? '').localeCompare(String(a.publishedAt ?? ''))
  )
}

const main = async () => {
  const cutoffTimestamp = getCutoffTimestamp()
  const venueCoordinates = await readJson(venueCoordinatesPath, [])
  const venueLookup = buildVenueLookup(venueCoordinates)
  const rawItems = []
  const errors = []
  let stoppedByRiskControl = false

  for (const uid of TARGET_UIDS) {
    try {
      rawItems.push(...(await crawlVideosForUid(uid, cutoffTimestamp)))
    } catch (error) {
      errors.push(`videos ${uid}: ${error.message}`)
      if (error instanceof BilibiliRiskError) {
        stoppedByRiskControl = true
        break
      }
    }

    await sleepWithJitter(REQUEST_DELAY_MS)

    try {
      rawItems.push(...(await crawlDynamicsForUid(uid, cutoffTimestamp)))
    } catch (error) {
      errors.push(`dynamics ${uid}: ${error.message}`)
      if (error instanceof BilibiliRiskError) {
        stoppedByRiskControl = true
        break
      }
    }

    await sleepWithJitter(ACCOUNT_DELAY_MS)
  }

  const incomingCandidates = rawItems
    .map((item) => toCandidate(item, venueLookup))
    .filter(Boolean)

  const existingCandidates = await readJson(candidatesPath, [])
  const mergedCandidates = mergeCandidates(existingCandidates, incomingCandidates)
  await writeJson(candidatesPath, mergedCandidates)

  console.log(`Scanned ${TARGET_UIDS.length} accounts.`)
  console.log(
    `Crawler pace: page size ${PAGE_SIZE}, ${REQUEST_DELAY_MS}ms + 0-${REQUEST_JITTER_MS}ms request delay, ${ACCOUNT_DELAY_MS}ms + 0-${REQUEST_JITTER_MS}ms account delay, ${MAX_VIDEO_PAGES_PER_UID} video page(s), ${MAX_DYNAMIC_PAGES_PER_UID} dynamic page(s) per account.`
  )
  console.log(`Matched ${incomingCandidates.length} new/updated candidate records.`)
  console.log(`Wrote ${mergedCandidates.length} total candidates to ${path.relative(rootDir, candidatesPath)}.`)

  if (errors.length > 0) {
    console.warn('Some Bilibili requests failed:')
    for (const error of errors) {
      console.warn(`- ${error}`)
    }
    if (stoppedByRiskControl) {
      console.warn('Stopped early after a rate-limit or risk-control response. Wait before retrying.')
    }
    console.warn('If public endpoints are restricted, retry with BILIBILI_COOKIE set.')
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
