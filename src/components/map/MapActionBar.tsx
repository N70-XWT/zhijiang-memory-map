'use client'

type MapActionBarProps = {
  canFocusSelected: boolean
  canCloseDetail: boolean
  hasActivities: boolean
  isDetailOpen: boolean
  isListOpen: boolean
  onFitAll: () => void
  onFocusSelected: () => void
  onCloseDetail: () => void
  onToggleList: () => void
}

const buttonClassName =
  'rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:cursor-not-allowed disabled:opacity-50'

export default function MapActionBar({
  canFocusSelected,
  canCloseDetail,
  hasActivities,
  isDetailOpen,
  isListOpen,
  onFitAll,
  onFocusSelected,
  onCloseDetail,
  onToggleList,
}: MapActionBarProps) {
  return (
    <div
      className={`pointer-events-none absolute right-3 z-[410] flex flex-col items-end gap-2 [contain:layout_paint] md:bottom-8 md:right-5 ${
        isDetailOpen ? 'bottom-[calc(62vh+0.75rem)]' : 'bottom-5'
      }`}
    >
      <div className="pointer-events-auto flex flex-wrap justify-end gap-1.5 rounded-xl border border-slate-300/90 bg-slate-50/95 p-1.5 shadow-lg backdrop-blur-md">
        <button
          type="button"
          onClick={onFitAll}
          disabled={!hasActivities}
          className={buttonClassName}
        >
          显示全部活动
        </button>
        <button
          type="button"
          onClick={onFocusSelected}
          disabled={!canFocusSelected}
          className={buttonClassName}
        >
          定位当前活动
        </button>
        <button
          type="button"
          onClick={onCloseDetail}
          disabled={!canCloseDetail}
          className={buttonClassName}
        >
          收起详情
        </button>
        <button type="button" onClick={onToggleList} className={buttonClassName}>
          {isListOpen ? '关闭列表' : '活动列表'}
        </button>
      </div>
    </div>
  )
}
