'use client'

import UiIcon from '@/components/common/UiIcon'

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

const buttonBaseClassName =
  'group inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold shadow-sm transition duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0'

const neutralButtonClassName = `${buttonBaseClassName} border-orange-100 bg-white text-slate-700 hover:border-orange-300 hover:bg-orange-50 hover:text-orange-800`

const activeListButtonClassName = `${buttonBaseClassName} border-blue-600 bg-blue-600 text-white hover:border-blue-700 hover:bg-blue-700 hover:text-white`

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
      className={`pointer-events-none absolute right-3 z-[410] flex flex-col items-end gap-2 [contain:layout_paint] md:bottom-5 md:right-5 ${
        isDetailOpen ? 'bottom-[calc(68vh+0.75rem)]' : 'bottom-3'
      }`}
    >
      <div className="pointer-events-auto grid grid-cols-2 gap-2 rounded-2xl border border-orange-200/80 bg-[#fffaf5]/95 p-2 shadow-[0_14px_38px_rgba(124,45,18,0.14)] backdrop-blur-md sm:flex sm:flex-wrap sm:justify-end">
        <button
          type="button"
          onClick={onFitAll}
          disabled={!hasActivities}
          className={neutralButtonClassName}
          aria-label="在地图中显示全部活动"
        >
          <UiIcon name="expand" className="h-4 w-4 text-orange-600" />
          <span>全部活动</span>
        </button>
        <button
          type="button"
          onClick={onFocusSelected}
          disabled={!canFocusSelected}
          className={neutralButtonClassName}
          aria-label="定位当前选中的活动"
        >
          <UiIcon name="focus" className="h-4 w-4 text-blue-600" />
          <span>当前活动</span>
        </button>
        <button
          type="button"
          onClick={onCloseDetail}
          disabled={!canCloseDetail}
          className={neutralButtonClassName}
          aria-label="收起活动详情"
        >
          <UiIcon name="collapse" className="h-4 w-4 text-orange-600" />
          <span>收起详情</span>
        </button>
        <button
          type="button"
          onClick={onToggleList}
          disabled={isDetailOpen}
          className={isListOpen ? activeListButtonClassName : neutralButtonClassName}
          aria-pressed={isListOpen}
        >
          <UiIcon name="list" className={`h-4 w-4 ${isListOpen ? 'text-white' : 'text-blue-600'}`} />
          <span>{isListOpen ? '关闭列表' : '活动列表'}</span>
        </button>
      </div>
    </div>
  )
}
