'use client'

import UiIcon from '@/components/common/UiIcon'

type ActivityFilterBarProps = {
  searchKeyword: string
  onSearchKeywordChange: (value: string) => void
  cityFilter: string
  cityOptions: string[]
  onCityFilterChange: (value: string) => void
  yearFilter: string
  yearOptions: number[]
  onYearFilterChange: (value: string) => void
  eventTypeFilter: string
  eventTypeOptions: string[]
  onEventTypeFilterChange: (value: string) => void
  memberFilter: string
  memberOptions: string[]
  onMemberFilterChange: (value: string) => void
  onClearFilters: () => void
  isClearDisabled: boolean
  resultCount: number
  totalCount: number
  activeCriteriaCount: number
  isCollapsed: boolean
  isHidden: boolean
  onToggleCollapsed: () => void
  onHide: () => void
  onShow: () => void
}

const inputClassName =
  'h-11 w-full rounded-xl border border-orange-100 bg-white px-3 text-sm font-medium text-slate-800 outline-none transition duration-200 placeholder:font-normal placeholder:text-slate-400 hover:border-orange-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15'

export default function ActivityFilterBar({
  searchKeyword,
  onSearchKeywordChange,
  cityFilter,
  cityOptions,
  onCityFilterChange,
  yearFilter,
  yearOptions,
  onYearFilterChange,
  eventTypeFilter,
  eventTypeOptions,
  onEventTypeFilterChange,
  memberFilter,
  memberOptions,
  onMemberFilterChange,
  onClearFilters,
  isClearDisabled,
  resultCount,
  totalCount,
  activeCriteriaCount,
  isCollapsed,
  isHidden,
  onToggleCollapsed,
  onHide,
  onShow,
}: ActivityFilterBarProps) {
  const summaryText =
    activeCriteriaCount > 0 ? `已筛选 ${activeCriteriaCount} 项` : '未启用筛选条件'

  return (
    <div className="pointer-events-none absolute inset-x-0 top-[66px] z-[430] flex justify-center px-2.5 md:top-[78px] md:px-4">
      {isHidden ? (
        <div className="pointer-events-auto flex w-full max-w-[1080px] justify-end">
          <button
            type="button"
            onClick={onShow}
            className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-orange-200/80 bg-[#fffaf5]/95 px-3.5 py-2 text-xs font-bold text-orange-800 shadow-[0_10px_28px_rgba(124,45,18,0.13)] backdrop-blur-md transition hover:border-orange-300 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2"
            aria-label="显示筛选区"
          >
            <UiIcon name="filter" className="h-4 w-4" />
            显示筛选
          </button>
        </div>
      ) : (
        <section className="pointer-events-auto w-full max-w-[1080px] overflow-hidden rounded-[22px] border border-orange-200/80 bg-[#fffaf5]/95 shadow-[0_18px_50px_rgba(124,45,18,0.14)] backdrop-blur-md">
          <div className="h-1 w-full bg-gradient-to-r from-orange-500 via-orange-400 to-blue-600" />
          <div className="p-2.5 md:p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-700">
                  <UiIcon name="filter" className="h-[18px] w-[18px]" />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-extrabold text-slate-950">探索活动</h2>
                    {activeCriteriaCount > 0 ? (
                      <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-bold text-white">
                        {activeCriteriaCount} 项筛选
                      </span>
                    ) : null}
                  </div>
                  <p className="truncate text-[11px] font-medium text-slate-500 md:text-xs">
                    {summaryText} · 显示{' '}
                    <span className="font-bold text-orange-700">{resultCount}</span> / {totalCount}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={onToggleCollapsed}
                  aria-expanded={!isCollapsed}
                  className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-orange-100 bg-white px-2.5 py-2 text-xs font-bold text-slate-700 transition hover:border-orange-200 hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
                >
                  <UiIcon name={isCollapsed ? 'chevron' : 'collapse'} className="h-4 w-4" />
                  {isCollapsed ? '展开' : '折叠'}
                </button>

                <button
                  type="button"
                  onClick={onHide}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-xl border border-orange-100 bg-white px-2.5 py-2 text-xs font-bold text-slate-700 transition hover:border-orange-200 hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
                  aria-label="隐藏筛选区"
                >
                  <UiIcon name="close" className="h-4 w-4" />
                  <span className="hidden sm:inline">隐藏</span>
                </button>
              </div>
            </div>

            <div
              className={`transition-all duration-200 ${
                isCollapsed
                  ? 'mt-0 max-h-0 overflow-hidden opacity-0'
                  : 'mt-3 max-h-[52vh] overflow-y-auto opacity-100 md:mt-4 md:max-h-[520px] md:overflow-visible'
              }`}
            >
              <div className="grid grid-cols-1 gap-2 pr-0.5 md:grid-cols-6 md:gap-2.5 md:pr-0">
                <label className="relative block md:col-span-2">
                  <span className="mb-1.5 block text-[11px] font-bold text-slate-600">关键词</span>
                  <UiIcon
                    name="search"
                    className="pointer-events-none absolute bottom-3.5 left-3 h-4 w-4 text-orange-600"
                  />
                  <input
                    value={searchKeyword}
                    onChange={(event) => onSearchKeywordChange(event.target.value)}
                    placeholder="搜索标题、城市或场馆"
                    className={`${inputClassName} pl-9`}
                    aria-label="搜索活动"
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-bold text-slate-600">城市</span>
                  <select
                    value={cityFilter}
                    onChange={(event) => onCityFilterChange(event.target.value)}
                    className={inputClassName}
                    aria-label="按城市筛选"
                  >
                    <option value="all">全部城市</option>
                    {cityOptions.map((city) => (
                      <option key={city} value={city}>
                        {city}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-bold text-slate-600">年份</span>
                  <select
                    value={yearFilter}
                    onChange={(event) => onYearFilterChange(event.target.value)}
                    className={inputClassName}
                    aria-label="按年份筛选"
                  >
                    <option value="all">全部年份</option>
                    {yearOptions.map((year) => (
                      <option key={year} value={String(year)}>
                        {year}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-bold text-slate-600">类型</span>
                  <select
                    value={eventTypeFilter}
                    onChange={(event) => onEventTypeFilterChange(event.target.value)}
                    className={inputClassName}
                    aria-label="按活动类型筛选"
                  >
                    <option value="all">全部类型</option>
                    {eventTypeOptions.map((eventType) => (
                      <option key={eventType} value={eventType}>
                        {eventType}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-bold text-slate-600">成员</span>
                  <select
                    value={memberFilter}
                    onChange={(event) => onMemberFilterChange(event.target.value)}
                    className={inputClassName}
                    aria-label="按成员标签筛选"
                  >
                    <option value="all">全部成员</option>
                    {memberOptions.map((member) => (
                      <option key={member} value={member}>
                        {member}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-3 flex items-center justify-between gap-3 border-t border-orange-100 pt-3">
                <p className="hidden text-[11px] text-slate-500 md:block">
                  组合筛选会即时同步到网址，便于分享当前地图。
                </p>
                <button
                  type="button"
                  onClick={onClearFilters}
                  disabled={isClearDisabled}
                  className="min-h-11 shrink-0 rounded-xl border border-orange-200 bg-white px-3.5 py-2 text-xs font-bold text-orange-800 transition hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 disabled:cursor-not-allowed disabled:opacity-45"
                >
                  清空筛选
                </button>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
