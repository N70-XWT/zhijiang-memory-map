'use client'

import { useEffect, useMemo, useState } from 'react'

type ReviewStatus = 'pending' | 'approved' | 'rejected'
type DisplayTier = 'primary' | 'supplemental'
type FilterKey = 'all' | ReviewStatus | DisplayTier

type ActivitySummary = {
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

type PoolVideo = {
  id: string
  title: string
  cover: string
  url: string
  sourceType: 'official' | 'fan'
  note?: string
  reviewStatus: ReviewStatus
  displayTier: DisplayTier
  sourceStage: string
  relevanceScore: number
  reviewedAt?: number
  reviewNote?: string
}

type PoolDetail = {
  activity: {
    id: string
    title: string
    date: string
    city: string
    venue: string
  }
  pool: {
    videos: PoolVideo[]
  }
  summary: ActivitySummary
}

const statusLabels: Record<ReviewStatus, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已拒绝',
}

const tierLabels: Record<DisplayTier, string> = {
  primary: '高相关',
  supplemental: '补充推荐',
}

const filters: { key: FilterKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待审核' },
  { key: 'approved', label: '已通过' },
  { key: 'rejected', label: '已拒绝' },
  { key: 'primary', label: '高相关' },
  { key: 'supplemental', label: '补充推荐' },
]

const getBvid = (video: PoolVideo): string => video.id || video.url

export default function RecommendationPoolsAdminPage() {
  const [activities, setActivities] = useState<ActivitySummary[]>([])
  const [selectedActivityId, setSelectedActivityId] = useState<string>('')
  const [detail, setDetail] = useState<PoolDetail | null>(null)
  const [filter, setFilter] = useState<FilterKey>('all')
  const [loading, setLoading] = useState(true)
  const [savingBvid, setSavingBvid] = useState<string>('')
  const [error, setError] = useState<string>('')

  const loadSummaries = async () => {
    const response = await fetch('/api/admin/recommendation-pools')
    const payload = await response.json()
    if (!response.ok) {
      throw new Error(payload.error || '加载推荐池失败')
    }

    const nextActivities = payload.activities as ActivitySummary[]
    setActivities(nextActivities)
    setSelectedActivityId((current) => current || nextActivities[0]?.activityId || '')
  }

  const loadDetail = async (activityId: string) => {
    if (!activityId) {
      setDetail(null)
      return
    }

    const response = await fetch(
      `/api/admin/recommendation-pools?activityId=${encodeURIComponent(activityId)}`
    )
    const payload = await response.json()
    if (!response.ok) {
      throw new Error(payload.error || '加载活动推荐池失败')
    }
    setDetail(payload as PoolDetail)
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    loadSummaries()
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : '加载失败')
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    if (!selectedActivityId) {
      return
    }

    setError('')
    loadDetail(selectedActivityId).catch((loadError) => {
      if (!cancelled) {
        setError(loadError instanceof Error ? loadError.message : '加载失败')
      }
    })

    return () => {
      cancelled = true
    }
  }, [selectedActivityId])

  const filteredVideos = useMemo(() => {
    const videos = detail?.pool.videos ?? []
    if (filter === 'all') {
      return videos
    }
    if (filter === 'primary' || filter === 'supplemental') {
      return videos.filter((video) => video.displayTier === filter)
    }
    return videos.filter((video) => video.reviewStatus === filter)
  }, [detail, filter])

  const patchVideo = async (
    video: PoolVideo,
    patch: {
      reviewStatus?: ReviewStatus
      displayTier?: DisplayTier
    }
  ) => {
    if (!selectedActivityId) {
      return
    }

    const bvid = getBvid(video)
    setSavingBvid(bvid)
    setError('')
    try {
      const response = await fetch('/api/admin/recommendation-pools', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          activityId: selectedActivityId,
          bvid,
          ...patch,
        }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || '保存失败')
      }
      setDetail({
        ...(detail as PoolDetail),
        pool: payload.pool,
        summary: payload.summary,
      })
      await loadSummaries()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存失败')
    } finally {
      setSavingBvid('')
    }
  }

  const selectedSummary =
    detail?.summary ?? activities.find((activity) => activity.activityId === selectedActivityId)

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950">
      <div className="flex min-h-screen flex-col lg:flex-row">
        <aside className="border-b border-slate-200 bg-white lg:w-80 lg:border-b-0 lg:border-r">
          <div className="border-b border-slate-200 px-5 py-4">
            <h1 className="text-lg font-semibold">推荐池审核</h1>
            <p className="mt-1 text-sm text-slate-500">后台审核状态不会展示到前台。</p>
          </div>

          <div className="max-h-[42vh] overflow-auto lg:max-h-[calc(100vh-89px)]">
            {activities.map((activity) => (
              <button
                key={activity.activityId}
                type="button"
                onClick={() => {
                  setFilter('all')
                  setSelectedActivityId(activity.activityId)
                }}
                className={`block w-full border-b border-slate-100 px-5 py-4 text-left transition ${
                  activity.activityId === selectedActivityId
                    ? 'bg-slate-900 text-white'
                    : 'bg-white hover:bg-slate-50'
                }`}
              >
                <span className="block text-sm font-semibold">{activity.title}</span>
                <span
                  className={`mt-1 block text-xs ${
                    activity.activityId === selectedActivityId ? 'text-slate-300' : 'text-slate-500'
                  }`}
                >
                  {activity.date} · {activity.city} · {activity.total} 条
                </span>
              </button>
            ))}
          </div>
        </aside>

        <section className="flex-1">
          <div className="border-b border-slate-200 bg-white px-5 py-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <p className="text-sm text-slate-500">{selectedSummary?.date}</p>
                <h2 className="mt-1 text-xl font-semibold">{selectedSummary?.title ?? '暂无活动'}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {selectedSummary?.city} · {selectedSummary?.venue}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {[
                  ['待审核', selectedSummary?.pending ?? 0],
                  ['已通过', selectedSummary?.approved ?? 0],
                  ['已拒绝', selectedSummary?.rejected ?? 0],
                  ['高相关', selectedSummary?.primary ?? 0],
                  ['补充', selectedSummary?.supplemental ?? 0],
                  ['拒绝BV', selectedSummary?.rejectedBvids ?? 0],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="text-xs text-slate-500">{label}</div>
                    <div className="mt-1 text-lg font-semibold">{value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {filters.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setFilter(item.key)}
                  className={`rounded-md border px-3 py-1.5 text-sm font-medium ${
                    filter === item.key
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {error ? (
            <div className="mx-5 mt-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          <div className="p-5">
            {loading ? (
              <div className="rounded-md border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
                加载中...
              </div>
            ) : filteredVideos.length === 0 ? (
              <div className="rounded-md border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
                当前筛选下没有视频。
              </div>
            ) : (
              <div className="space-y-3">
                {filteredVideos.map((video) => {
                  const bvid = getBvid(video)
                  const saving = savingBvid === bvid
                  return (
                    <article
                      key={bvid}
                      className="grid gap-3 rounded-md border border-slate-200 bg-white p-3 md:grid-cols-[160px_minmax(0,1fr)]"
                    >
                      <a
                        href={video.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block aspect-video overflow-hidden rounded-md bg-slate-200"
                      >
                        {video.cover ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={video.cover} alt="" className="h-full w-full object-cover" />
                        ) : null}
                      </a>

                      <div className="min-w-0">
                        <div className="flex flex-col gap-2 xl:flex-row xl:items-start xl:justify-between">
                          <div className="min-w-0">
                            <a
                              href={video.url}
                              target="_blank"
                              rel="noreferrer"
                              className="line-clamp-2 text-base font-semibold text-slate-950 hover:text-sky-700"
                            >
                              {video.title}
                            </a>
                            <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
                              <span className="rounded bg-slate-100 px-2 py-1">{bvid}</span>
                              <span className="rounded bg-slate-100 px-2 py-1">
                                {statusLabels[video.reviewStatus]}
                              </span>
                              <span className="rounded bg-slate-100 px-2 py-1">
                                {tierLabels[video.displayTier]}
                              </span>
                              <span className="rounded bg-slate-100 px-2 py-1">
                                {video.sourceStage}
                              </span>
                              <span className="rounded bg-slate-100 px-2 py-1">
                                分数 {video.relevanceScore}
                              </span>
                            </div>
                            {video.reviewNote ? (
                              <p className="mt-2 text-sm text-slate-500">{video.reviewNote}</p>
                            ) : null}
                          </div>

                          <div className="flex flex-wrap gap-2 xl:justify-end">
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => patchVideo(video, { reviewStatus: 'approved' })}
                              className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                            >
                              通过
                            </button>
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => patchVideo(video, { reviewStatus: 'rejected' })}
                              className="rounded-md bg-rose-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                            >
                              拒绝
                            </button>
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => patchVideo(video, { displayTier: 'primary' })}
                              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-50"
                            >
                              设为高相关
                            </button>
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => patchVideo(video, { displayTier: 'supplemental' })}
                              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-50"
                            >
                              设为补充
                            </button>
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => patchVideo(video, { reviewStatus: 'pending' })}
                              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 disabled:opacity-50"
                            >
                              恢复待审
                            </button>
                          </div>
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
