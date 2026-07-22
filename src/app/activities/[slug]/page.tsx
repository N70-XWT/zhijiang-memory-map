import type { Metadata } from 'next'
import Link from 'next/link'
import FallbackImage from '@/components/common/FallbackImage'
import RelatedVideoSection from '@/components/videos/RelatedVideoSection'
import { getActivityBySlug, getRelatedActivities } from '@/data/activityRepository'

type ActivityDetailPageProps = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({
  params,
}: ActivityDetailPageProps): Promise<Metadata> {
  const { slug } = await params
  const activity = getActivityBySlug(slug)

  if (!activity) {
    return {
      title: '活动不存在 | A-SOUL 线下活动回忆地图',
      description: '未找到对应活动，返回地图页继续浏览。',
    }
  }

  return {
    title: `${activity.title} | A-SOUL 线下活动回忆地图`,
    description: activity.summary,
  }
}

export default async function ActivityDetailPage({ params }: ActivityDetailPageProps) {
  const { slug } = await params
  const activity = getActivityBySlug(slug)

  if (!activity) {
    return (
      <main className="min-h-screen bg-slate-100 px-4 py-10 text-slate-900">
        <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold">活动不存在</h1>
          <p className="mt-3 text-sm text-slate-600">
            你访问的活动链接无效或已被移除，可以返回地图页继续浏览其他活动。
          </p>
          <Link
            href="/"
            className="mt-5 inline-flex rounded-md border border-slate-300 bg-slate-100 px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-200"
          >
            返回地图
          </Link>
        </div>
      </main>
    )
  }

  const relatedActivities = getRelatedActivities(activity, 3)
  const mapBackLink = `/?activity=${activity.id}`

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto w-full max-w-5xl px-4 py-5 md:px-6 md:py-8">
        <header className="mb-4 flex flex-wrap items-center gap-2">
          <Link
            href={mapBackLink}
            className="inline-flex rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-100"
          >
            返回地图
          </Link>
          <Link
            href={mapBackLink}
            className="inline-flex rounded-md border border-slate-300 bg-slate-900 px-3 py-2 text-sm font-medium text-slate-50 transition hover:bg-slate-700"
          >
            在地图中查看该活动
          </Link>
        </header>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="relative aspect-[16/7] w-full bg-slate-200">
            <FallbackImage
              src={activity.coverImage}
              alt={activity.title}
              wrapperClassName="h-full w-full"
              className="h-full w-full object-cover"
              fallbackText="活动头图"
              loading="eager"
              width={1200}
              height={520}
              sizes="(max-width: 767px) calc(100vw - 2rem), 976px"
              quality={78}
            />
          </div>

          <div className="space-y-4 p-4 md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold md:text-3xl">{activity.title}</h1>
                <p className="mt-2 text-sm text-slate-600">
                  {activity.date} · {activity.city} · {activity.venue}
                </p>
                {activity.venueAddress ? (
                  <p className="mt-1 text-sm text-slate-500">地址：{activity.venueAddress}</p>
                ) : null}
              </div>

              <span className="rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                {activity.eventType}
              </span>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <h2 className="text-sm font-semibold text-slate-900">活动简介</h2>
                <p className="mt-2 text-sm leading-6 text-slate-700">{activity.summary}</p>
              </article>

              <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <h2 className="text-sm font-semibold text-slate-900">完整说明</h2>
                <p className="mt-2 text-sm leading-6 text-slate-700">{activity.description}</p>
              </article>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-slate-900">成员与标签</h2>

              <div className="mt-3">
                <p className="text-xs text-slate-500">成员</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {activity.members.map((member) => (
                    <span
                      key={`${activity.id}-member-${member}`}
                      className="rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs text-slate-700"
                    >
                      {member}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-3">
                <p className="text-xs text-slate-500">标签</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {activity.tags.map((tag) => (
                    <span
                      key={`${activity.id}-tag-${tag}`}
                      className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-700"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <RelatedVideoSection activity={activity} variant="page" />

        {relatedActivities.length > 0 ? (
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
            <h2 className="text-lg font-semibold">相关活动</h2>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              {relatedActivities.map((related) => (
                <article
                  key={related.id}
                  className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
                >
                  <div className="relative aspect-[16/10] w-full bg-slate-200">
                    <FallbackImage
                      src={related.coverImage}
                      alt={related.title}
                      wrapperClassName="h-full w-full"
                      className="h-full w-full object-cover"
                      fallbackText="活动图片"
                      width={360}
                      height={220}
                      sizes="(max-width: 767px) calc(100vw - 2rem), 310px"
                      quality={75}
                    />
                  </div>
                  <div className="space-y-2 p-3">
                    <h3 className="text-sm font-semibold text-slate-900">{related.title}</h3>
                    <p className="text-xs text-slate-600">
                      {related.date} · {related.city}
                    </p>
                    <Link
                      href={`/activities/${related.slug}`}
                      className="inline-flex rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
                    >
                      查看详情
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  )
}
