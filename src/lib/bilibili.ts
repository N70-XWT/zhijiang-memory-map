import { createHash } from 'node:crypto'
import type { Activity, BilibiliVideo } from '@/types/activity'

type WbiImageInfo = {
  img_url?: string
  sub_url?: string
}

type BilibiliNavPayload = {
  code?: number
  message?: string
  data?: {
    wbi_img?: WbiImageInfo
  }
}

type BilibiliSearchPayload = {
  code?: number
  message?: string
  data?: {
    result?: BilibiliSearchItem[]
  }
}

type BilibiliViewPayload = {
  code?: number
  message?: string
  data?: BilibiliViewInfo
}

type BilibiliTagPayload = {
  code?: number
  message?: string
  data?: BilibiliTagInfo[]
}

type BilibiliRelatedPayload = {
  code?: number
  message?: string
  data?: BilibiliRelatedItem[]
}

type BilibiliSearchItem = {
  bvid?: string
  title?: string
  pic?: string
  arcurl?: string
  pubdate?: number
}

type BilibiliViewInfo = {
  bvid?: string
  title?: string
  desc?: string
  pic?: string
  pubdate?: number
  tname?: string
  owner?: {
    name?: string
  }
}

type BilibiliTagInfo = {
  tag_name?: string
}

type BilibiliRelatedItem = {
  bvid?: string
  title?: string
  pic?: string
  pubdate?: number
}

type CandidateVideo = {
  bvid: string
  searchItem: BilibiliSearchItem
  sourceKeywords: string[]
  orderIndex: number
}

type EnrichedCandidateVideo = CandidateVideo & {
  detail?: BilibiliViewInfo
  detailError?: string
  tagError?: string
  tags: string[]
}

type ScoredCandidateVideo = EnrichedCandidateVideo & {
  dateBucket: 'primary' | 'backfill'
  dateDiffDays: number
  matchedFields: string[]
  score: number
}

export type RelatedBilibiliDebugCandidate = {
  bvid: string
  title: string
  dateDiffDays: number | null
  filteredReason?: string
  matchedFields: string[]
  score: number
  sourceKeywords: string[]
  tags: string[]
}

export type RelatedBilibiliDebugInfo = {
  searchTerms: string[]
  searchedCandidateCount: number
  dedupedCandidateCount: number
  detailFetchLimit: number
  detailFetchedCount: number
  tagFetchedCount: number
  selectedCount: number
  candidates: RelatedBilibiliDebugCandidate[]
  errors: string[]
}

const BILIBILI_BASE_HEADERS = {
  accept: 'application/json, text/plain, */*',
  'accept-language': 'zh-CN,zh;q=0.9,en;q=0.7',
  referer: 'https://www.bilibili.com/',
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
}

const WBI_MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33,
  9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26,
  17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20,
  34, 44, 52,
]

const BVID_PATTERN = /BV[a-zA-Z0-9]{8,}/
const SEARCH_LIMIT = 8
const RECOMMEND_LIMIT = 5
const DETAIL_FETCH_LIMIT = 12
const PRIMARY_DATE_WINDOW_DAYS = 20
const BACKFILL_DATE_WINDOW_DAYS = 45
const MAX_EXTRA_PROBE_PAGES = 1
const BILIBILI_REQUEST_TIMEOUT_MS = 8000

const getBilibiliHeaders = () => {
  const cookie = process.env.BILIBILI_COOKIE?.trim()
  return cookie ? { ...BILIBILI_BASE_HEADERS, cookie } : BILIBILI_BASE_HEADERS
}

const fetchBilibiliJson = async <Payload>(url: string): Promise<Payload> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), BILIBILI_REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      headers: getBilibiliHeaders(),
      next: { revalidate: 0 },
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`Bilibili request failed with HTTP ${response.status}.`)
    }

    return (await response.json()) as Payload
  } finally {
    clearTimeout(timeout)
  }
}

const getUrlKey = (url: string | undefined): string => {
  if (!url) {
    return ''
  }

  const filename = url.split('/').pop() ?? ''
  return filename.split('.')[0] ?? ''
}

const getMixinKey = ({ img_url: imgUrl, sub_url: subUrl }: WbiImageInfo): string => {
  const original = `${getUrlKey(imgUrl)}${getUrlKey(subUrl)}`
  return WBI_MIXIN_KEY_ENC_TAB.map((index) => original[index]).join('').slice(0, 32)
}

const sanitizeWbiValue = (value: string): string => value.replace(/[!'()*]/g, '')

const signWbiParams = (params: Record<string, string | number>, mixinKey: string) => {
  const signedParams: Record<string, string | number> = {
    ...params,
    wts: Math.round(Date.now() / 1000),
  }

  const query = Object.keys(signedParams)
    .sort()
    .map((key) => {
      const value = sanitizeWbiValue(String(signedParams[key]))
      return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
    })
    .join('&')

  const wRid = createHash('md5').update(`${query}${mixinKey}`).digest('hex')
  return `${query}&w_rid=${wRid}`
}

export const extractBvid = (value: string): string | null => value.match(BVID_PATTERN)?.[0] ?? null

export const normalizeBilibiliImageUrl = (value: string | undefined): string => {
  if (!value) {
    return ''
  }
  if (value.startsWith('//')) {
    return `https:${value}`
  }
  return value.replace(/^http:\/\//, 'https://')
}

export const cleanBilibiliTitle = (value: string | undefined): string =>
  (value ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()

export const fetchWbiMixinKey = async (): Promise<string> => {
  const payload = await fetchBilibiliJson<BilibiliNavPayload>(
    'https://api.bilibili.com/x/web-interface/nav'
  )
  const wbiImage = payload.data?.wbi_img
  if (payload.code !== 0 || !wbiImage?.img_url || !wbiImage.sub_url) {
    throw new Error(payload.message || 'Bilibili WBI key is unavailable.')
  }

  return getMixinKey(wbiImage)
}

export const searchBilibiliVideos = async (
  keyword: string,
  mixinKey: string,
  page: number
): Promise<BilibiliSearchItem[]> => {
  const query = signWbiParams(
    {
      search_type: 'video',
      keyword,
      page,
      order: 'pubdate',
      duration: 0,
    },
    mixinKey
  )

  const payload = await fetchBilibiliJson<BilibiliSearchPayload>(
    `https://api.bilibili.com/x/web-interface/wbi/search/type?${query}`
  )
  if (payload.code !== 0) {
    throw new Error(payload.message || `Bilibili search returned code ${payload.code}.`)
  }

  return payload.data?.result?.slice(0, SEARCH_LIMIT) ?? []
}

const normalizeText = (value: string): string => value.toLowerCase().replace(/\s+/g, '')

const buildSearchTerms = (activity: Activity): string[] => {
  const title = activity.title.trim()
  const members = activity.members.map((member) => member.trim()).filter(Boolean)
  const tags = activity.tags.map((tag) => tag.trim()).filter(Boolean)

  return Array.from(
    new Set(
      [
        title,
        ...members.map((member) => `${title} ${member}`),
        ...members.flatMap((member) => [
          `${member} 线下`,
          `${member} 专场`,
          `${member} VLOG`,
          `${member} 全纪录`,
        ]),
        `${activity.date} ${activity.city} A-SOUL`,
        ...tags.map((tag) => `${activity.city} ${tag}`),
      ].filter((value) => value.trim().length > 0)
    )
  )
}

const getPresetBvids = (activity: Activity, excludedBvids: Set<string>): Set<string> =>
  new Set(
    [
      ...activity.bilibiliVideos
        .map((video) => extractBvid(`${video.id} ${video.url}`))
        .filter((bvid): bvid is string => Boolean(bvid)),
      ...excludedBvids,
    ]
  )

const getSeedBvids = (activity: Activity): string[] =>
  Array.from(
    new Set(
      activity.bilibiliVideos
        .map((video) => extractBvid(`${video.id} ${video.url}`))
        .filter((bvid): bvid is string => Boolean(bvid))
    )
  )

const getActivityPublishDiffDays = (
  activity: Activity,
  item: Pick<BilibiliSearchItem, 'pubdate'>
): number | null => {
  if (!item.pubdate) {
    return null
  }

  const activityTime = new Date(`${activity.date}T00:00:00+08:00`).getTime()
  const publishTime = item.pubdate * 1000
  const diffDays = Math.abs(activityTime - publishTime) / 86_400_000

  return Number.isFinite(diffDays) ? diffDays : null
}

const getFieldText = (candidate: EnrichedCandidateVideo) => ({
  title: normalizeText(cleanBilibiliTitle(candidate.detail?.title || candidate.searchItem.title)),
  description: normalizeText(candidate.detail?.desc ?? ''),
  tags: normalizeText(candidate.tags.join(' ')),
  owner: normalizeText(candidate.detail?.owner?.name ?? ''),
  category: normalizeText(candidate.detail?.tname ?? ''),
})

const getMatchTerms = (activity: Activity) =>
  [
    { label: 'activityTitle', value: activity.title, weight: 40 },
    { label: 'city', value: activity.city, weight: 15 },
    { label: 'venue', value: activity.venue, weight: 14 },
    { label: 'date', value: activity.date, weight: 12 },
    { label: 'dateCompact', value: activity.date.replace(/-/g, ''), weight: 12 },
    { label: 'asoul', value: 'A-SOUL', weight: 18 },
    { label: 'asoulCompact', value: 'ASOUL', weight: 18 },
    { label: 'offline', value: '线下', weight: 12 },
    ...activity.members.map((member) => ({ label: `member:${member}`, value: member, weight: 20 })),
    ...activity.tags.map((tag) => ({ label: `tag:${tag}`, value: tag, weight: 14 })),
  ].map((term) => ({ ...term, normalized: normalizeText(term.value) }))

const getContentMatch = (activity: Activity, candidate: EnrichedCandidateVideo) => {
  const fields = getFieldText(candidate)
  const terms = getMatchTerms(activity)
  const matchedFields = new Set<string>()
  let score = 0

  for (const term of terms) {
    if (!term.normalized) {
      continue
    }

    if (fields.title.includes(term.normalized)) {
      matchedFields.add(`title:${term.label}`)
      score += term.weight * 1.2
    }
    if (fields.tags.includes(term.normalized)) {
      matchedFields.add(`tags:${term.label}`)
      score += term.weight * 1.1
    }
    if (fields.description.includes(term.normalized)) {
      matchedFields.add(`description:${term.label}`)
      score += term.weight * 0.8
    }
    if (fields.owner.includes(term.normalized) || fields.category.includes(term.normalized)) {
      matchedFields.add(`meta:${term.label}`)
      score += term.weight * 0.45
    }
  }

  return {
    matchedFields: Array.from(matchedFields),
    score,
  }
}

const getScoredCandidate = (
  activity: Activity,
  candidate: EnrichedCandidateVideo
): ScoredCandidateVideo | null => {
  const pubdate = candidate.detail?.pubdate ?? candidate.searchItem.pubdate
  const dateDiffDays = getActivityPublishDiffDays(activity, { pubdate })
  if (dateDiffDays === null || dateDiffDays > BACKFILL_DATE_WINDOW_DAYS) {
    return null
  }

  const contentMatch = getContentMatch(activity, candidate)
  if (contentMatch.matchedFields.length === 0) {
    return null
  }

  const dateBucket = dateDiffDays <= PRIMARY_DATE_WINDOW_DAYS ? 'primary' : 'backfill'
  const dateScore = Math.max(0, BACKFILL_DATE_WINDOW_DAYS - dateDiffDays)
  const bucketScore = dateBucket === 'primary' ? 1000 : 0
  const keywordScore = Math.max(0, 12 - candidate.sourceKeywords.length)

  return {
    ...candidate,
    dateBucket,
    dateDiffDays,
    matchedFields: contentMatch.matchedFields,
    score: bucketScore + contentMatch.score + dateScore + keywordScore - candidate.orderIndex * 0.01,
  }
}

const toDebugCandidate = (
  candidate: EnrichedCandidateVideo,
  activity: Activity,
  filteredReason?: string
): RelatedBilibiliDebugCandidate => {
  const pubdate = candidate.detail?.pubdate ?? candidate.searchItem.pubdate
  const scored = filteredReason ? null : getScoredCandidate(activity, candidate)
  const contentMatch = getContentMatch(activity, candidate)

  return {
    bvid: candidate.bvid,
    title: cleanBilibiliTitle(candidate.detail?.title || candidate.searchItem.title),
    dateDiffDays: getActivityPublishDiffDays(activity, { pubdate }),
    filteredReason,
    matchedFields: scored?.matchedFields ?? contentMatch.matchedFields,
    score: scored?.score ?? contentMatch.score,
    sourceKeywords: candidate.sourceKeywords,
    tags: candidate.tags,
  }
}

const fetchVideoDetail = async (bvid: string): Promise<BilibiliViewInfo> => {
  const url = new URL('https://api.bilibili.com/x/web-interface/view')
  url.searchParams.set('bvid', bvid)

  const payload = await fetchBilibiliJson<BilibiliViewPayload>(url.toString())
  if (payload.code !== 0 || !payload.data) {
    throw new Error(payload.message || `Bilibili view returned code ${payload.code}.`)
  }

  return payload.data
}

const fetchVideoTags = async (bvid: string): Promise<string[]> => {
  const url = new URL('https://api.bilibili.com/x/tag/archive/tags')
  url.searchParams.set('bvid', bvid)

  const payload = await fetchBilibiliJson<BilibiliTagPayload>(url.toString())
  if (payload.code !== 0) {
    throw new Error(payload.message || `Bilibili tag returned code ${payload.code}.`)
  }

  return (payload.data ?? [])
    .map((tag) => tag.tag_name?.trim())
    .filter((tag): tag is string => Boolean(tag))
}

const fetchRelatedVideosBySeed = async (bvid: string): Promise<BilibiliSearchItem[]> => {
  const url = new URL('https://api.bilibili.com/x/web-interface/archive/related')
  url.searchParams.set('bvid', bvid)

  const payload = await fetchBilibiliJson<BilibiliRelatedPayload>(url.toString())
  if (payload.code !== 0) {
    throw new Error(payload.message || `Bilibili related returned code ${payload.code}.`)
  }

  return (payload.data ?? []).slice(0, SEARCH_LIMIT).map((item) => ({
    bvid: item.bvid,
    title: item.title,
    pic: item.pic,
    pubdate: item.pubdate,
    arcurl: item.bvid ? `https://www.bilibili.com/video/${item.bvid}` : undefined,
  }))
}

const enrichCandidate = async (candidate: CandidateVideo): Promise<EnrichedCandidateVideo> => {
  let detail: BilibiliViewInfo | undefined
  let detailError: string | undefined
  let tagError: string | undefined
  let tags: string[] = []

  try {
    detail = await fetchVideoDetail(candidate.bvid)
  } catch (error) {
    detailError = error instanceof Error ? error.message : 'Failed to fetch video detail.'
  }

  try {
    tags = await fetchVideoTags(candidate.bvid)
  } catch (error) {
    tagError = error instanceof Error ? error.message : 'Failed to fetch video tags.'
  }

  return {
    ...candidate,
    detail,
    detailError,
    tagError,
    tags,
  }
}

const collectRelatedCandidates = async (
  activity: Activity,
  mixinKey: string,
  page: number,
  excludedBvids: Set<string>,
  debugEnabled: boolean
): Promise<{ videos: BilibiliVideo[]; debug: RelatedBilibiliDebugInfo }> => {
  const presetBvids = getPresetBvids(activity, excludedBvids)
  const searchTerms = buildSearchTerms(activity)
  const deduped = new Map<string, CandidateVideo>()
  const errors: string[] = []
  let orderIndex = 0
  let searchedCandidateCount = 0

  const addCandidate = (item: BilibiliSearchItem, sourceKeyword: string) => {
    const bvid = item.bvid
    if (!bvid || presetBvids.has(bvid)) {
      return
    }

    const existing = deduped.get(bvid)
    if (existing) {
      existing.sourceKeywords.push(sourceKeyword)
      return
    }

    if (!item.pic) {
      return
    }

    deduped.set(bvid, {
      bvid,
      searchItem: item,
      sourceKeywords: [sourceKeyword],
      orderIndex,
    })
    orderIndex += 1
  }

  const searchResults = await Promise.allSettled(
    searchTerms.map(async (keyword) => ({
      keyword,
      items: await searchBilibiliVideos(keyword, mixinKey, page),
    }))
  )

  for (const result of searchResults) {
    if (result.status === 'rejected') {
      errors.push(result.reason instanceof Error ? result.reason.message : 'Bilibili search failed.')
      continue
    }

    const { keyword, items } = result.value
    searchedCandidateCount += items.length
    for (const item of items) {
      addCandidate(item, keyword)
    }
  }

  const seedResults = await Promise.allSettled(
    getSeedBvids(activity).map(async (seedBvid) => ({
      seedBvid,
      items: await fetchRelatedVideosBySeed(seedBvid),
    }))
  )

  for (const result of seedResults) {
    if (result.status === 'rejected') {
      errors.push(
        result.reason instanceof Error
          ? `seed related: ${result.reason.message}`
          : 'Bilibili seed related failed.'
      )
      continue
    }

    const { seedBvid, items } = result.value
    searchedCandidateCount += items.length
    for (const item of items) {
      addCandidate(item, `seed:${seedBvid}`)
    }
  }

  const candidates = Array.from(deduped.values()).slice(0, DETAIL_FETCH_LIMIT)
  const enrichedCandidates = await Promise.all(candidates.map(enrichCandidate))
  const scoredCandidates: ScoredCandidateVideo[] = []
  const debugCandidates: RelatedBilibiliDebugCandidate[] = []

  for (const candidate of enrichedCandidates) {
    if (candidate.detailError) {
      errors.push(`${candidate.bvid} detail: ${candidate.detailError}`)
    }
    if (candidate.tagError) {
      errors.push(`${candidate.bvid} tags: ${candidate.tagError}`)
    }

    const pubdate = candidate.detail?.pubdate ?? candidate.searchItem.pubdate
    const dateDiffDays = getActivityPublishDiffDays(activity, { pubdate })
    const contentMatch = getContentMatch(activity, candidate)
    let filteredReason: string | undefined

    if (dateDiffDays === null) {
      filteredReason = 'missing_pubdate'
    } else if (dateDiffDays > BACKFILL_DATE_WINDOW_DAYS) {
      filteredReason = 'outside_45_day_window'
    } else if (contentMatch.matchedFields.length === 0) {
      filteredReason = 'no_title_tag_description_match'
    }

    const scored = filteredReason ? null : getScoredCandidate(activity, candidate)
    if (scored) {
      scoredCandidates.push(scored)
    }

    if (debugEnabled) {
      debugCandidates.push(toDebugCandidate(candidate, activity, filteredReason))
    }
  }

  const videos: BilibiliVideo[] = scoredCandidates
    .sort((a, b) => b.score - a.score)
    .slice(0, RECOMMEND_LIMIT)
    .map((candidate) => ({
      id: candidate.bvid,
      title: cleanBilibiliTitle(candidate.detail?.title || candidate.searchItem.title),
      cover: normalizeBilibiliImageUrl(candidate.detail?.pic || candidate.searchItem.pic),
      url: candidate.searchItem.arcurl?.startsWith('http')
        ? candidate.searchItem.arcurl.replace(/^http:\/\//, 'https://')
        : `https://www.bilibili.com/video/${candidate.bvid}`,
      sourceType: 'fan',
      note: '自动推荐',
    }))

  return {
    videos,
    debug: {
      searchTerms,
      searchedCandidateCount,
      dedupedCandidateCount: deduped.size,
      detailFetchLimit: DETAIL_FETCH_LIMIT,
      detailFetchedCount: enrichedCandidates.filter((candidate) => candidate.detail).length,
      tagFetchedCount: enrichedCandidates.filter((candidate) => candidate.tags.length > 0).length,
      selectedCount: videos.length,
      candidates: debugCandidates,
      errors,
    },
  }
}

export type RelatedBilibiliVideoPage = {
  videos: BilibiliVideo[]
  hasMore: boolean
  nextPage: number | null
  debug?: RelatedBilibiliDebugInfo
}

export const findRelatedBilibiliVideos = async (
  activity: Activity,
  page: number,
  excludedBvids = new Set<string>(),
  options: { debug?: boolean } = {}
): Promise<RelatedBilibiliVideoPage> => {
  const mixinKey = await fetchWbiMixinKey()
  const startPage = Math.max(1, Math.floor(page))
  const debugPages: RelatedBilibiliDebugInfo[] = []

  for (let offset = 0; offset <= MAX_EXTRA_PROBE_PAGES; offset += 1) {
    const currentPage = startPage + offset
    const result = await collectRelatedCandidates(
      activity,
      mixinKey,
      currentPage,
      excludedBvids,
      Boolean(options.debug)
    )

    if (options.debug) {
      debugPages.push(result.debug)
    }

    if (result.videos.length > 0) {
      return {
        videos: result.videos,
        hasMore: true,
        nextPage: currentPage + 1,
        debug: options.debug
          ? {
              ...result.debug,
              errors: debugPages.flatMap((pageDebug) => pageDebug.errors),
            }
          : undefined,
      }
    }
  }

  return {
    videos: [],
    hasMore: false,
    nextPage: null,
    debug: options.debug
      ? {
          searchTerms: buildSearchTerms(activity),
          searchedCandidateCount: debugPages.reduce(
            (total, pageDebug) => total + pageDebug.searchedCandidateCount,
            0
          ),
          dedupedCandidateCount: debugPages.reduce(
            (total, pageDebug) => total + pageDebug.dedupedCandidateCount,
            0
          ),
          detailFetchLimit: DETAIL_FETCH_LIMIT,
          detailFetchedCount: debugPages.reduce(
            (total, pageDebug) => total + pageDebug.detailFetchedCount,
            0
          ),
          tagFetchedCount: debugPages.reduce(
            (total, pageDebug) => total + pageDebug.tagFetchedCount,
            0
          ),
          selectedCount: 0,
          candidates: debugPages.flatMap((pageDebug) => pageDebug.candidates),
          errors: debugPages.flatMap((pageDebug) => pageDebug.errors),
        }
      : undefined,
  }
}
