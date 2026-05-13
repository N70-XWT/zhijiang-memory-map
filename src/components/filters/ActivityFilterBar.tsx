'use client'

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
  'h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-300/70'

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
    <div className="pointer-events-none absolute inset-x-0 top-12 z-[430] flex justify-center px-2.5 md:top-16 md:px-4">
      {isHidden ? (
        <div className="pointer-events-auto flex w-full max-w-[1080px] justify-end">
          <button
            type="button"
            onClick={onShow}
            className="rounded-full border border-slate-300 bg-slate-50/95 px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm backdrop-blur-md transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 md:py-2"
            aria-label="显示筛选区"
          >
            显示筛选
          </button>
        </div>
      ) : (
        <section className="pointer-events-auto w-full max-w-[1080px] rounded-xl border border-slate-300/90 bg-slate-50/95 p-2.5 shadow-lg backdrop-blur-md md:rounded-2xl md:p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-800">活动筛选</h2>
              <p className="truncate text-xs text-slate-600">
                {summaryText} · 当前显示 {resultCount} / {totalCount}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={onToggleCollapsed}
                aria-expanded={!isCollapsed}
                className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 md:px-2.5"
              >
                {isCollapsed ? '展开' : '折叠'}
              </button>

              <button
                type="button"
                onClick={onHide}
                className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 md:px-2.5"
              >
                隐藏
              </button>
            </div>
          </div>

          <div
            className={`transition-all duration-200 ${
              isCollapsed
                ? 'mt-0 max-h-0 overflow-hidden opacity-0'
                : 'mt-2 max-h-[48vh] overflow-y-auto opacity-100 md:mt-3 md:max-h-[520px] md:overflow-visible'
            }`}
          >
            <div className="grid grid-cols-1 gap-1.5 pr-0.5 md:grid-cols-5 md:gap-2 md:pr-0">
              <input
                value={searchKeyword}
                onChange={(event) => onSearchKeywordChange(event.target.value)}
                placeholder="搜索标题 / 城市 / 场馆"
                className={`${inputClassName} md:col-span-2`}
                aria-label="搜索活动"
              />

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

              <select
                value={memberFilter}
                onChange={(event) => onMemberFilterChange(event.target.value)}
                className={`${inputClassName} md:col-span-2`}
                aria-label="按成员标签筛选"
              >
                <option value="all">全部成员</option>
                {memberOptions.map((member) => (
                  <option key={member} value={member}>
                    {member}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-2 flex justify-end md:mt-3">
              <button
                type="button"
                onClick={onClearFilters}
                disabled={isClearDisabled}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                清空筛选
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
