'use client'
import Link from 'next/link'
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
} from 'react'
import UiIcon from '@/components/common/UiIcon'
import StateIcon from '@/components/common/StateIcon'
import FallbackImage from '@/components/common/FallbackImage'
import RelatedVideoSection from '@/components/videos/RelatedVideoSection'
import { RelatedVideoPlaceholder } from '@/components/videos/RelatedVideoSkeleton'
import { usePanelFocus } from '@/components/hooks/usePanelFocus'
import type { Activity } from '@/types/activity'

type Sheet = 'summary' | 'half' | 'full'
type Props = {
  activity: Activity | null
  isOpen: boolean
  isDesktop: boolean
  sheet: Sheet
  onSheetChange: (sheet: Sheet) => void
  onClose: () => void
  onBackToList?: () => void
  timelineNavigation?: {
    currentIndex: number
    totalCount: number
    previousActivity: Activity | null
    nextActivity: Activity | null
    onSelect: (activity: Activity) => void
    onFocusCurrent: () => void
  }
}
function DetailBody({
  activity,
  visible,
  stable,
}: {
  activity: Activity
  visible: boolean
  stable: boolean
}) {
  const videos = useRef<HTMLDivElement>(null)
  const [nearVideos, setNearVideos] = useState(false)
  useEffect(() => {
    const el = videos.current
    if (!el || !visible) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setNearVideos(true)
      },
      { root: el.parentElement, rootMargin: '80px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [visible])
  return (
    <div
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-5"
      hidden={!visible}
      inert={!visible}
    >
      <FallbackImage
        src={activity.coverImage}
        alt={activity.title}
        width={720}
        height={405}
        sizes="(min-width: 1024px) 368px, 100vw"
        wrapperClassName="memory-lift-cover mb-4 aspect-video w-full overflow-hidden rounded-[14px] bg-orange-50"
        className="h-full w-full object-cover"
        fallbackText="海报暂时无法加载"
      />
      <div className="memory-lift-copy">
        <div className="mb-3 flex flex-wrap gap-2 text-xs text-slate-600">
          <span>{activity.eventType}</span>
          <span>·</span>
          <span>{activity.members.join(' / ')}</span>
        </div>
        <h3 className="text-sm font-bold text-orange-800">活动回忆</h3>
        <p className="mt-2 text-sm leading-6 text-slate-700">
          {activity.summary}
        </p>
        <Link
          href={`/activities/${activity.slug}`}
          className="memory-button mt-4 w-fit"
        >
          完整详情
          <UiIcon name="arrow" className="h-4 w-4" />
        </Link>
        <div ref={videos} className="mt-5 min-h-24">
          {nearVideos && stable && visible ? (
            <RelatedVideoSection
              key={activity.id}
              activity={activity}
              variant="panel"
            />
          ) : (
            <RelatedVideoPlaceholder activity={activity} />
          )}
        </div>
      </div>
    </div>
  )
}
export default function ActivityDetailPanel(p: Props) {
  const panel = useRef<HTMLElement>(null)
  const open = p.isOpen && Boolean(p.activity)
  const modal = open && !p.isDesktop && p.sheet === 'full'
  usePanelFocus(panel, open, p.onClose, modal)
  const [stableActivity, setStableActivity] = useState<string | null>(null)
  const drag = useRef<{
    y: number
    time: number
    delta: number
    pointerId: number
  } | null>(null)
  const animation = useRef<Animation | null>(null)
  const releaseOffset = useRef(0)
  const previousHeight = useRef<number | null>(null)
  const previousOpen = useRef(false)
  useLayoutEffect(() => {
    const el = panel.current
    if (!el) return
    const height = el.offsetHeight
    animation.current?.cancel()
    if (
      open &&
      previousOpen.current &&
      !p.isDesktop &&
      previousHeight.current !== null &&
      previousHeight.current !== height &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      animation.current = el.animate(
        [
          { transform: `translateY(${height - previousHeight.current + releaseOffset.current}px)` },
          { transform: 'translateY(0)' },
        ],
        { duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)' },
      )
    }
    releaseOffset.current = 0
    previousHeight.current = height
    previousOpen.current = open
    return () => animation.current?.cancel()
  }, [open, p.sheet, p.isDesktop])
  useEffect(() => {
    setStableActivity(null)
    if (!open || !p.activity) return
    const id = p.activity.id
    const timer = setTimeout(
      () => setStableActivity(id),
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 240,
    )
    return () => clearTimeout(timer)
  }, [open, p.activity?.id, p.sheet])
  const startDrag = (e: PointerEvent<HTMLElement>) => {
    if (
      p.isDesktop ||
      (e.target as HTMLElement).closest('button,a') ||
      e.button !== 0
    )
      return
    animation.current?.cancel()
    drag.current = {
      y: e.clientY,
      time: performance.now(),
      delta: 0,
      pointerId: e.pointerId,
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    if (panel.current) panel.current.style.transition = 'none'
  }
  const moveDrag = (e: PointerEvent<HTMLElement>) => {
    if (!drag.current || drag.current.pointerId !== e.pointerId) return
    const delta = e.clientY - drag.current.y
    drag.current.delta = delta
    if (panel.current) panel.current.style.transform = `translateY(${delta}px)`
  }
  const stopDrag = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current
    if (!d) return
    drag.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId)
    const el = panel.current
    if (el) {
      el.style.transform = ''
      el.style.transition = ''
    }
    const levels: Sheet[] = ['summary', 'half', 'full']
    const index = levels.indexOf(p.sheet)
    const velocity = d.delta / Math.max(1, performance.now() - d.time)
    const commit =
      e.type !== 'pointercancel' &&
      (Math.abs(d.delta) > 48 || Math.abs(velocity) > 0.45)
    const target = commit
      ? levels[Math.max(0, Math.min(2, index + (d.delta < 0 ? 1 : -1)))]
      : p.sheet
    if (
      target === p.sheet &&
      el &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      animation.current = el.animate(
        [
          { transform: `translateY(${d.delta}px)` },
          { transform: 'translateY(0)' },
        ],
        { duration: 180, easing: 'ease-out' },
      )
    }
    releaseOffset.current = target === p.sheet ? 0 : d.delta
    p.onSheetChange(target)
  }
  const nav = p.timelineNavigation
  const summary = !p.isDesktop && p.sheet === 'summary'
  return (
    <>
      {modal && (
        <button
          tabIndex={-1}
          className="absolute inset-0 z-[460] bg-slate-950/20"
          aria-label="收起全屏详情"
          onClick={() => p.onSheetChange('half')}
        />
      )}
      <aside
        ref={panel}
        tabIndex={-1}
        role={modal ? 'dialog' : 'complementary'}
        aria-modal={modal || undefined}
        aria-label="活动回忆"
        aria-hidden={!open}
        inert={!open}
        data-map-edge={p.isDesktop ? 'right' : 'bottom'}
        data-map-active={open}
        data-sheet={p.sheet}
        className={`memory-side-panel memory-detail ${open ? 'is-open' : ''} ${modal ? 'is-full' : ''}`}
      >
        <header
          className="detail-drag-header shrink-0 px-4"
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={stopDrag}
          onPointerCancel={stopDrag}
        >
          <div
            className="mx-auto mt-2 h-1 w-10 rounded-full bg-orange-200 lg:hidden"
            aria-hidden="true"
          />
          <div className="flex min-h-12 items-center justify-between gap-2">
            {p.onBackToList ? (
              <button
                className="memory-button !border-0 !bg-transparent !px-0"
                onClick={p.onBackToList}
              >
                <UiIcon name="arrow" className="h-4 w-4 rotate-180" />
                返回列表
              </button>
            ) : (
              <span className="text-xs font-semibold text-orange-800">
                活动回忆
              </span>
            )}
            <div className="flex items-center gap-1">
              {!p.isDesktop && (
                <button
                  className="memory-button !border-0 !bg-transparent"
                  onClick={() =>
                    p.onSheetChange(
                      summary ? 'half' : p.sheet === 'half' ? 'full' : 'half',
                    )
                  }
                >
                  <StateIcon kind="disclosure" active={p.sheet !== 'full'} />
                  {summary ? '展开' : p.sheet === 'half' ? '全屏' : '半屏'}
                </button>
              )}
              {!p.isDesktop && !summary && (
                <button
                  className="memory-button !border-0 !bg-transparent"
                  onClick={() => p.onSheetChange('summary')}
                >
                  收起
                </button>
              )}
              <button
                className="memory-button icon !border-0 !bg-transparent"
                aria-label="关闭详情"
                onClick={p.onClose}
              >
                <UiIcon name="close" className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>
        {p.activity && (
          <>
            <div
              className={`detail-drag-header shrink-0 px-4 ${summary ? '' : 'pb-3'}`}
              onPointerDown={startDrag}
              onPointerMove={moveDrag}
              onPointerUp={stopDrag}
              onPointerCancel={stopDrag}
            >
              <h2
                className={`memory-lift-title ${summary ? 'truncate text-base' : 'line-clamp-2 text-lg leading-6 lg:text-xl'} font-bold`}
              >
                {p.activity.title}
              </h2>
              {!summary && (
                <p className="mt-1.5 text-sm leading-5 text-slate-600">
                  {p.activity.date} · {p.activity.city} · {p.activity.venue}
                </p>
              )}
            </div>
            {!p.isDesktop && nav && (
              <nav
                className="grid shrink-0 grid-cols-[44px_minmax(0,1fr)_44px] items-center px-3 pb-1"
                aria-label="相邻活动导航"
              >
                <button
                  className="memory-button icon !border-0 !bg-transparent"
                  disabled={!nav.previousActivity}
                  data-press-feedback=""
                  aria-label="上一场活动"
                  onClick={() =>
                    nav.previousActivity && nav.onSelect(nav.previousActivity)
                  }
                >
                  <UiIcon name="arrow" className="h-4 w-4 rotate-180" />
                </button>
                <button
                  className="min-h-11 min-w-0 text-center text-xs text-slate-600"
                  aria-label="在地图中重新定位当前活动"
                  onClick={nav.onFocusCurrent}
                >
                  <span className="block truncate">
                    {summary
                      ? `${p.activity.date} · ${p.activity.city} · ${p.activity.venue}`
                      : '在地图中定位'}
                  </span>
                  <span>
                    {nav.currentIndex} / {nav.totalCount}
                  </span>
                </button>
                <button
                  className="memory-button icon !border-0 !bg-transparent"
                  disabled={!nav.nextActivity}
                  data-press-feedback=""
                  aria-label="下一场活动"
                  onClick={() =>
                    nav.nextActivity && nav.onSelect(nav.nextActivity)
                  }
                >
                  <UiIcon name="arrow" className="h-4 w-4" />
                </button>
              </nav>
            )}
            <DetailBody
              key={p.activity.id}
              activity={p.activity}
              visible={open && !summary}
              stable={stableActivity === p.activity.id}
            />
          </>
        )}
      </aside>
    </>
  )
}
