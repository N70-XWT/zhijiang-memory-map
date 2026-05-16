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

type StationTier = 'current_station' | 'same_tour_fallback'

type ScoredCandidateVideo = EnrichedCandidateVideo & {
  dateBucket: 'primary' | 'backfill'
  dateDiffDays: number
  matchedFields: string[]
  relevance: 'strong' | 'fallback'
  stationTier: StationTier
  score: number
}

export type RelatedBilibiliDebugCandidate = {
  bvid: string
  title: string
  dateDiffDays: number | null
  filteredReason?: string
  matchedFields: string[]
  strongMatches: string[]
  contextMatches: string[]
  weakMatches: string[]
  relevance?: 'strong' | 'fallback'
  stationTier?: StationTier
  stationMatches: string[]
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
const SEARCH_LIMIT = 12
const RECOMMEND_LIMIT = 8
const DETAIL_FETCH_LIMIT = 32
const PRIMARY_DATE_WINDOW_DAYS = 20
const BACKFILL_DATE_WINDOW_DAYS = 45
const EXTENDED_STRONG_DATE_WINDOW_DAYS = 370
const MAX_EXTRA_PROBE_PAGES = 2
const BILIBILI_REQUEST_TIMEOUT_MS = 8000
const KNOWN_MULTI_STATION_TOUR_CITIES = ['上海', '北京', '广州', '成都']

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

const normalizeText = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[\s\-—–_·・:：,，.。()[\]（）【】「」『』《》/\\]+/g, '')

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

const removeGenericTitleWords = (value: string): string =>
  value
    .replace(/A-SOUL/gi, ' ')
    .replace(/ASOUL/gi, ' ')
    .replace(/线下演唱会|线下|演唱会|专场|个人|团体|单人|活动/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const uniqueValues = (values: string[]): string[] =>
  Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))

const extractTitleSignals = (activity: Activity): string[] => {
  const blockedSignals = new Set([
    normalizeText(activity.city),
    normalizeText(`${activity.city}站`),
    'a',
    'soul',
    'asoul',
  ])

  const titlePieces = activity.title
    .replace(/A-SOUL/gi, 'ASOUL')
    .split(/[-—–|｜:：]/)
    .flatMap((piece) => {
      const cleaned = removeGenericTitleWords(piece)
      return [cleaned, ...cleaned.split(/\s+/)]
    })

  const presetPieces = activity.bilibiliVideos.flatMap((video) =>
    cleanBilibiliTitle(video.title)
      .replace(/A-SOUL/gi, 'ASOUL')
      .split(/[-—–|｜:：【】\[\]()（）]/)
      .flatMap((piece) => {
        const cleaned = removeGenericTitleWords(piece)
        return [cleaned, ...cleaned.split(/\s+/)]
      })
  )

  return uniqueValues([...titlePieces, ...presetPieces])
    .filter((value) => {
      const normalized = normalizeText(value)
      return normalized.length >= 2 && !blockedSignals.has(normalized)
    })
    .slice(0, 8)
}

const buildRelevantSearchTerms = (activity: Activity): string[] => {
  const title = activity.title.trim()
  const members = activity.members.map((member) => member.trim()).filter(Boolean)
  const titleSignals = extractTitleSignals(activity)
  const primarySignal = titleSignals[0] ?? title
  const secondarySignal = titleSignals.find((signal) => signal !== primarySignal) ?? ''
  const cityStation = `${activity.city}站`
  const signalPhrase = [primarySignal, secondarySignal].filter(Boolean).join(' ')
  const strongSurfaceKeywords = ['侧屏', '主屏', '直拍', '全程', '全纪录', '录播', 'call', '实录']
  const venueToken = getVenueSearchToken(activity)

  return uniqueValues([
    title,
    `A-SOUL ${signalPhrase} ${activity.city}`,
    `A-SOUL ${signalPhrase} ${cityStation}`,
    `A-SOUL ${primarySignal} ${activity.city}`,
    `${primarySignal} ${cityStation}`,
    `${primarySignal} ${activity.city}场`,
    `A-SOUL ${signalPhrase}`,
    `A-SOUL ${primarySignal}`,
    `${primarySignal} ${secondarySignal}`.trim(),
    `A-SOUL ${primarySignal} 线下`,
    `A-SOUL ${primarySignal} ${venueToken}`,
    `A-SOUL ${primarySignal} 全纪录`,
    `${activity.date} ${activity.city} A-SOUL ${primarySignal}`,
    ...strongSurfaceKeywords.map((keyword) => `A-SOUL ${primarySignal} ${activity.city} ${keyword}`),
    ...strongSurfaceKeywords.map((keyword) => `${primarySignal} ${activity.city} ${keyword}`),
    ...members.map((member) => `${title} ${member}`),
    ...members.flatMap((member) => [
      `${member} ${primarySignal} ${activity.city}`,
      `${member} ${primarySignal} ${cityStation}`,
      `${member} ${primarySignal} 直拍`,
    ]),
  ]).slice(0, 28)
}

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
    relevance: 'strong',
    stationTier: 'current_station',
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
    strongMatches: [],
    contextMatches: contentMatch.matchedFields,
    weakMatches: [],
    relevance: scored?.relevance,
    stationTier: scored?.stationTier,
    stationMatches: [],
    score: scored?.score ?? contentMatch.score,
    sourceKeywords: candidate.sourceKeywords,
    tags: candidate.tags,
  }
}

type RelevantMatchTerm = {
  label: string
  normalized: string
  weight: number
  kind: 'strong' | 'context' | 'weak'
}

type RawRelevantMatchTerm = Omit<RelevantMatchTerm, 'normalized'> & {
  value: string
}

type RelevantContentMatch = {
  matchedFields: string[]
  strongMatches: string[]
  contextMatches: string[]
  weakMatches: string[]
  relevance?: 'strong' | 'fallback'
  stationTier?: StationTier
  stationMatches: string[]
  score: number
}

type StationMatch = {
  tier?: StationTier
  matches: string[]
  filteredReason?: 'missing_station_anchor'
}

const getVenueSearchToken = (activity: Activity): string => {
  const [token = ''] = activity.venue.split(/[\s（(,，/／-]/)
  return token.trim()
}

const isStationScopedActivity = (activity: Activity): boolean => {
  const normalizedTitle = normalizeText(activity.title)
  return (
    normalizedTitle.includes(normalizeText(`${activity.city}站`)) ||
    normalizedTitle.includes(normalizeText('魔法时间夏日'))
  )
}

const hasNormalizedMatch = (text: string, values: string[]): boolean =>
  values
    .map(normalizeText)
    .filter((value) => value.length >= 2)
    .some((value) => text.includes(value))

const getStationMatch = (activity: Activity, fields: ReturnType<typeof getFieldText>): StationMatch => {
  if (!isStationScopedActivity(activity)) {
    return { tier: 'current_station', matches: ['general_activity'] }
  }

  const venueToken = getVenueSearchToken(activity)
  const currentStationTerms = uniqueValues([
    activity.city,
    `${activity.city}站`,
    activity.venue,
    venueToken,
  ])
  const otherStationTerms = uniqueValues(
    KNOWN_MULTI_STATION_TOUR_CITIES
      .filter((city) => normalizeText(city) !== normalizeText(activity.city))
      .flatMap((city) => [city, `${city}站`, `${city}场`])
  )
  const visibleText = `${fields.title}${fields.tags}`
  const allText = `${visibleText}${fields.description}`
  const visibleCurrent = hasNormalizedMatch(visibleText, currentStationTerms)
  const anyCurrent = visibleCurrent || hasNormalizedMatch(allText, currentStationTerms)
  const visibleOther = hasNormalizedMatch(visibleText, otherStationTerms)
  const anyOther = visibleOther || hasNormalizedMatch(allText, otherStationTerms)

  if (visibleCurrent || (anyCurrent && !visibleOther)) {
    return { tier: 'current_station', matches: ['current_station'] }
  }
  if (anyOther) {
    return { tier: 'same_tour_fallback', matches: ['other_station_deferred'] }
  }
  if (hasNormalizedMatch(visibleText, extractTitleSignals(activity))) {
    return { tier: 'same_tour_fallback', matches: ['same_tour_unscoped'] }
  }

  return {
    matches: [],
    filteredReason: 'missing_station_anchor',
  }
}

const getRelevantMatchTerms = (activity: Activity): RelevantMatchTerm[] => {
  const titleSignals = extractTitleSignals(activity)

  const terms: RawRelevantMatchTerm[] = [
    { label: 'activityTitle', value: activity.title, weight: 58, kind: 'strong' },
    { label: 'asoul', value: 'A-SOUL', weight: 32, kind: 'strong' },
    { label: 'asoulCompact', value: 'ASOUL', weight: 32, kind: 'strong' },
    ...titleSignals.map((signal) => ({
      label: `theme:${signal}`,
      value: signal,
      weight: 36,
      kind: 'strong' as const,
    })),
    { label: 'city', value: activity.city, weight: 13, kind: 'context' },
    { label: 'cityStation', value: `${activity.city}站`, weight: 18, kind: 'context' },
    { label: 'venue', value: activity.venue, weight: 12, kind: 'context' },
    { label: 'date', value: activity.date, weight: 10, kind: 'context' },
    { label: 'dateCompact', value: activity.date.replace(/-/g, ''), weight: 10, kind: 'context' },
    ...activity.members.map((member) => ({
      label: `member:${member}`,
      value: member,
      weight: 12,
      kind: 'context' as const,
    })),
    { label: 'offline', value: '线下', weight: 5, kind: 'weak' },
    { label: 'fullRecord', value: '全纪录', weight: 7, kind: 'weak' },
    { label: 'recording', value: '录播', weight: 7, kind: 'weak' },
    ...activity.tags.map((tag) => ({
      label: `tag:${tag}`,
      value: tag,
      weight: 5,
      kind: 'weak' as const,
    })),
  ]

  return terms
    .map((term) => ({ ...term, normalized: normalizeText(term.value) }))
    .filter((term) => term.normalized.length > 0)
}

const getRelevantContentMatch = (
  activity: Activity,
  candidate: EnrichedCandidateVideo
): RelevantContentMatch => {
  const fields = getFieldText(candidate)
  const terms = getRelevantMatchTerms(activity)
  const matchedFields = new Set<string>()
  const strongMatches = new Set<string>()
  const contextMatches = new Set<string>()
  const weakMatches = new Set<string>()
  let score = 0

  const registerMatch = (term: RelevantMatchTerm, field: string, multiplier: number) => {
    const matchLabel = `${field}:${term.kind}:${term.label}`
    matchedFields.add(matchLabel)
    if (term.kind === 'strong') {
      strongMatches.add(matchLabel)
    } else if (term.kind === 'context') {
      contextMatches.add(matchLabel)
    } else {
      weakMatches.add(matchLabel)
    }
    score += term.weight * multiplier
  }

  for (const term of terms) {
    if (fields.title.includes(term.normalized)) {
      registerMatch(term, 'title', 1.25)
    }
    if (fields.tags.includes(term.normalized)) {
      registerMatch(term, 'tags', 1.05)
    }
    if (fields.description.includes(term.normalized)) {
      registerMatch(term, 'description', 0.75)
    }
    if (fields.owner.includes(term.normalized) || fields.category.includes(term.normalized)) {
      registerMatch(term, 'meta', 0.3)
    }
  }

  const strongMatchList = Array.from(strongMatches)
  const contextMatchList = Array.from(contextMatches)
  const isVisibleSurfaceMatch = (match: string) =>
    match.startsWith('title:') || match.startsWith('tags:')
  const isAsoulMatch = (match: string) => match.includes(':asoul')
  const isThemeMatch = (match: string) =>
    match.includes(':theme:') || match.includes(':activityTitle')
  const titleOrTagStrongMatches = strongMatchList.filter(isVisibleSurfaceMatch)
  const hasThemeMatch = strongMatchList.some(isThemeMatch)
  const hasVisibleAsoulMatch = titleOrTagStrongMatches.some(isAsoulMatch)
  const hasVisibleThemeMatch = titleOrTagStrongMatches.some(isThemeMatch)
  const hasVisibleContextMatch = contextMatchList.some(
    (match) => match.startsWith('title:') || match.startsWith('tags:')
  )
  const relevance =
    hasVisibleThemeMatch &&
    (hasVisibleAsoulMatch || hasVisibleContextMatch || titleOrTagStrongMatches.length >= 2)
      ? 'strong'
      : hasVisibleAsoulMatch && hasThemeMatch && contextMatchList.length > 0
        ? 'fallback'
        : undefined
  const stationMatch = relevance ? getStationMatch(activity, fields) : { matches: [] }

  return {
    matchedFields: Array.from(matchedFields),
    strongMatches: strongMatchList,
    contextMatches: contextMatchList,
    weakMatches: Array.from(weakMatches),
    relevance,
    stationTier: stationMatch.tier,
    stationMatches: stationMatch.matches,
    score,
  }
}

const getRelevantFilteredReason = (
  activity: Activity,
  candidate: EnrichedCandidateVideo
): string | undefined => {
  const pubdate = candidate.detail?.pubdate ?? candidate.searchItem.pubdate
  const dateDiffDays = getActivityPublishDiffDays(activity, { pubdate })
  const contentMatch = getRelevantContentMatch(activity, candidate)

  if (dateDiffDays === null) {
    return 'missing_pubdate'
  }
  if (contentMatch.strongMatches.length === 0) {
    return contentMatch.matchedFields.length > 0 ? 'weak_only_match' : 'missing_strong_anchor'
  }
  const hasThemeAnchor = contentMatch.strongMatches.some(
    (match) => match.includes(':theme:') || match.includes(':activityTitle')
  )
  if (!hasThemeAnchor) {
    return 'missing_theme_anchor'
  }
  const hasVisibleAnchor = contentMatch.strongMatches.some(
    (match) => match.startsWith('title:') || match.startsWith('tags:')
  )
  if (!hasVisibleAnchor) {
    return 'anchor_only_in_description'
  }
  if (!contentMatch.relevance) {
    return 'missing_context_for_anchor'
  }
  if (!contentMatch.stationTier) {
    return 'missing_station_anchor'
  }
  if (
    dateDiffDays > BACKFILL_DATE_WINDOW_DAYS &&
    (contentMatch.relevance !== 'strong' || dateDiffDays > EXTENDED_STRONG_DATE_WINDOW_DAYS)
  ) {
    return 'outside_date_window'
  }

  return undefined
}

const getRelevantScoredCandidate = (
  activity: Activity,
  candidate: EnrichedCandidateVideo
): ScoredCandidateVideo | null => {
  const pubdate = candidate.detail?.pubdate ?? candidate.searchItem.pubdate
  const dateDiffDays = getActivityPublishDiffDays(activity, { pubdate })
  if (dateDiffDays === null) {
    return null
  }

  const contentMatch = getRelevantContentMatch(activity, candidate)
  if (!contentMatch.relevance) {
    return null
  }
  if (!contentMatch.stationTier) {
    return null
  }
  if (
    dateDiffDays > BACKFILL_DATE_WINDOW_DAYS &&
    (contentMatch.relevance !== 'strong' || dateDiffDays > EXTENDED_STRONG_DATE_WINDOW_DAYS)
  ) {
    return null
  }

  const dateBucket = dateDiffDays <= PRIMARY_DATE_WINDOW_DAYS ? 'primary' : 'backfill'
  const dateScore = Math.max(0, BACKFILL_DATE_WINDOW_DAYS - dateDiffDays)
  const bucketScore = dateBucket === 'primary' ? 300 : 0
  const relevanceScore = contentMatch.relevance === 'strong' ? 2000 : 900
  const stationScore = contentMatch.stationTier === 'current_station' ? 1800 : 0
  const keywordScore = Math.max(0, 12 - candidate.sourceKeywords.length)

  return {
    ...candidate,
    dateBucket,
    dateDiffDays,
    matchedFields: contentMatch.matchedFields,
    relevance: contentMatch.relevance,
    stationTier: contentMatch.stationTier,
    score:
      relevanceScore +
      stationScore +
      bucketScore +
      contentMatch.score +
      dateScore +
      keywordScore -
      candidate.orderIndex * 0.01,
  }
}

const toRelevantDebugCandidate = (
  candidate: EnrichedCandidateVideo,
  activity: Activity,
  filteredReason?: string
): RelatedBilibiliDebugCandidate => {
  const pubdate = candidate.detail?.pubdate ?? candidate.searchItem.pubdate
  const scored = filteredReason ? null : getRelevantScoredCandidate(activity, candidate)
  const contentMatch = getRelevantContentMatch(activity, candidate)

  return {
    bvid: candidate.bvid,
    title: cleanBilibiliTitle(candidate.detail?.title || candidate.searchItem.title),
    dateDiffDays: getActivityPublishDiffDays(activity, { pubdate }),
    filteredReason,
    matchedFields: scored?.matchedFields ?? contentMatch.matchedFields,
    strongMatches: contentMatch.strongMatches,
    contextMatches: contentMatch.contextMatches,
    weakMatches: contentMatch.weakMatches,
    relevance: scored?.relevance ?? contentMatch.relevance,
    stationTier: scored?.stationTier ?? contentMatch.stationTier,
    stationMatches: contentMatch.stationMatches,
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

  return {
    ...candidate,
    detail,
    detailError,
    tagError,
    tags,
  }
}

const getCandidatePreScore = (activity: Activity, candidate: CandidateVideo): number => {
  const title = normalizeText(cleanBilibiliTitle(candidate.searchItem.title))
  const sourceText = normalizeText(candidate.sourceKeywords.join(' '))
  const titleSignals = extractTitleSignals(activity).map(normalizeText)
  const city = normalizeText(activity.city)
  const cityStation = normalizeText(`${activity.city}站`)
  const dateDiffDays = getActivityPublishDiffDays(activity, candidate.searchItem)
  let score = 0

  if (title.includes('asoul') || title.includes('a-soul')) {
    score += 120
  }
  if (titleSignals.some((signal) => signal.length >= 2 && title.includes(signal))) {
    score += 140
  }
  if (title.includes(city) || title.includes(cityStation)) {
    score += 90
  }
  if (sourceText.includes(city) || sourceText.includes(cityStation)) {
    score += 35
  }
  if (dateDiffDays !== null && dateDiffDays <= BACKFILL_DATE_WINDOW_DAYS) {
    score += 80 - dateDiffDays
  }
  if (dateDiffDays !== null && dateDiffDays > BACKFILL_DATE_WINDOW_DAYS) {
    score -= 120
  }

  return score - candidate.orderIndex * 0.001
}

const selectScoredCandidates = (candidates: ScoredCandidateVideo[]): ScoredCandidateVideo[] => {
  const sortedCandidates = [...candidates].sort((a, b) => b.score - a.score)
  const currentStrongCandidates = sortedCandidates.filter(
    (candidate) => candidate.stationTier === 'current_station' && candidate.relevance === 'strong'
  )
  const currentFallbackCandidates = sortedCandidates.filter(
    (candidate) => candidate.stationTier === 'current_station' && candidate.relevance === 'fallback'
  )
  const sameTourCandidates = sortedCandidates.filter(
    (candidate) => candidate.stationTier === 'same_tour_fallback'
  )

  return [
    ...currentStrongCandidates,
    ...currentFallbackCandidates,
    ...sameTourCandidates,
  ].slice(0, RECOMMEND_LIMIT)
}

const toBilibiliVideo = (candidate: ScoredCandidateVideo): BilibiliVideo => ({
  id: candidate.bvid,
  title: cleanBilibiliTitle(candidate.detail?.title || candidate.searchItem.title),
  cover: normalizeBilibiliImageUrl(candidate.detail?.pic || candidate.searchItem.pic),
  url: candidate.searchItem.arcurl?.startsWith('http')
    ? candidate.searchItem.arcurl.replace(/^http:\/\//, 'https://')
    : `https://www.bilibili.com/video/${candidate.bvid}`,
  sourceType: 'fan',
  note: '自动推荐',
})

const collectRelatedCandidates = async (
  activity: Activity,
  mixinKey: string,
  page: number,
  excludedBvids: Set<string>,
  debugEnabled: boolean
): Promise<{ scoredCandidates: ScoredCandidateVideo[]; debug: RelatedBilibiliDebugInfo }> => {
  const presetBvids = getPresetBvids(activity, excludedBvids)
  const searchTerms = buildRelevantSearchTerms(activity)
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

  const candidates = Array.from(deduped.values())
    .sort((a, b) => getCandidatePreScore(activity, b) - getCandidatePreScore(activity, a))
    .slice(0, DETAIL_FETCH_LIMIT)
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

    let filteredReason: string | undefined

    filteredReason = getRelevantFilteredReason(activity, candidate)

    const scored = filteredReason ? null : getRelevantScoredCandidate(activity, candidate)
    if (scored) {
      scoredCandidates.push(scored)
    }

    if (debugEnabled) {
      debugCandidates.push(toRelevantDebugCandidate(candidate, activity, filteredReason))
    }
  }

  return {
    scoredCandidates,
    debug: {
      searchTerms,
      searchedCandidateCount,
      dedupedCandidateCount: deduped.size,
      detailFetchLimit: DETAIL_FETCH_LIMIT,
      detailFetchedCount: enrichedCandidates.filter((candidate) => candidate.detail).length,
      tagFetchedCount: enrichedCandidates.filter((candidate) => candidate.tags.length > 0).length,
      selectedCount: selectScoredCandidates(scoredCandidates).length,
      candidates: debugCandidates,
      errors,
    },
  }
}

export type RelatedBilibiliVideoPage = {
  error?: string
  videos: BilibiliVideo[]
  hasMore: boolean
  nextPage: number | null
  debug?: RelatedBilibiliDebugInfo
}

export type RelatedBilibiliVideoList = {
  videos: BilibiliVideo[]
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
  const scoredByBvid = new Map<string, ScoredCandidateVideo>()
  let nextProbePage: number | null = startPage

  for (let offset = 0; offset <= MAX_EXTRA_PROBE_PAGES; offset += 1) {
    const currentPage = startPage + offset
    nextProbePage = currentPage + 1
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

    for (const candidate of result.scoredCandidates) {
      if (!scoredByBvid.has(candidate.bvid)) {
        scoredByBvid.set(candidate.bvid, candidate)
      }
    }

    const selectedCandidates = selectScoredCandidates(Array.from(scoredByBvid.values()))
    if (selectedCandidates.length >= RECOMMEND_LIMIT) {
      const videos = selectedCandidates.map(toBilibiliVideo)
      return {
        videos,
        hasMore: true,
        nextPage: nextProbePage,
        debug: options.debug
          ? {
              searchTerms: buildRelevantSearchTerms(activity),
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
              selectedCount: videos.length,
              candidates: debugPages.flatMap((pageDebug) => pageDebug.candidates),
              errors: debugPages.flatMap((pageDebug) => pageDebug.errors),
            }
          : undefined,
      }
    }
  }

  const selectedCandidates = selectScoredCandidates(Array.from(scoredByBvid.values()))
  if (selectedCandidates.length > 0) {
    const videos = selectedCandidates.map(toBilibiliVideo)
    return {
      videos,
      hasMore: true,
      nextPage: nextProbePage,
      debug: options.debug
        ? {
            searchTerms: buildRelevantSearchTerms(activity),
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
            selectedCount: videos.length,
            candidates: debugPages.flatMap((pageDebug) => pageDebug.candidates),
            errors: debugPages.flatMap((pageDebug) => pageDebug.errors),
          }
        : undefined,
    }
  }

  return {
    videos: [],
    hasMore: false,
    nextPage: null,
    debug: options.debug
      ? {
          searchTerms: buildRelevantSearchTerms(activity),
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

export const generateRelatedBilibiliVideoList = async (
  activity: Activity,
  pageLimit = 6,
  options: { debug?: boolean } = {}
): Promise<RelatedBilibiliVideoList> => {
  const videos: BilibiliVideo[] = []
  const usedBvids = new Set<string>()
  const debugPages: RelatedBilibiliDebugInfo[] = []

  let page = 1
  for (let requestCount = 0; requestCount < pageLimit && page <= pageLimit; requestCount += 1) {
    const result = await findRelatedBilibiliVideos(activity, page, usedBvids, options)
    if (result.debug) {
      debugPages.push(result.debug)
    }

    for (const video of result.videos) {
      const key = extractBvid(`${video.id} ${video.url}`) ?? video.id ?? video.url
      if (!key || usedBvids.has(key)) {
        continue
      }

      usedBvids.add(key)
      videos.push(video)
    }

    if (!result.hasMore || !result.nextPage || result.videos.length === 0) {
      break
    }
    page = result.nextPage
  }

  return {
    videos,
    debug: options.debug
      ? {
          searchTerms: debugPages[0]?.searchTerms ?? buildRelevantSearchTerms(activity),
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
          selectedCount: videos.length,
          candidates: debugPages.flatMap((pageDebug) => pageDebug.candidates),
          errors: debugPages.flatMap((pageDebug) => pageDebug.errors),
        }
      : undefined,
  }
}
