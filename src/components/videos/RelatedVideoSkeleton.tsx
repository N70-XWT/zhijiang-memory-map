import type { Activity } from '@/types/activity'

type Props = {
  variant: 'panel' | 'page'
  count?: number
  label?: string
}

export default function RelatedVideoSkeleton({
  variant,
  count = 2,
  label = '正在加载相关视频…',
}: Props) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className={variant === 'page' ? 'grid gap-3 md:grid-cols-2' : 'space-y-3'} aria-hidden="true">
        {Array.from({ length: count }, (_, index) => (
          <div key={index} className="memory-video-skeleton overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="aspect-video w-full border-b border-slate-200 bg-orange-100/60" />
            <div className="space-y-2.5 p-3">
              <div className="flex h-10 flex-col justify-between py-1">
                <div className="h-3 w-5/6 rounded bg-slate-200" />
                <div className="h-3 w-3/5 rounded bg-slate-200" />
              </div>
              <div className="h-[22px] w-16 rounded-full bg-slate-100" />
              <div className="h-[30px] w-24 rounded-md bg-slate-200" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Match the real section before its deferred mount, including known preset slots.
export function RelatedVideoPlaceholder({ activity }: { activity: Activity }) {
  return (
    <section className="space-y-3 pb-2" aria-label="B站相关视频" aria-busy="true">
      <h2 className="text-sm font-semibold text-slate-900">B站相关视频</h2>
      <div className="space-y-4">
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-slate-500">收录视频</h3>
          {activity.bilibiliVideos.length ? (
            <RelatedVideoSkeleton variant="panel" count={activity.bilibiliVideos.length} />
          ) : (
            <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-4 text-sm text-slate-600">
              当前活动暂未收录相关视频。
            </p>
          )}
        </div>
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-slate-500">自动推荐</h3>
          <RelatedVideoSkeleton variant="panel" />
        </div>
      </div>
    </section>
  )
}
