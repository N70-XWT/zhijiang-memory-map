'use client'

import { useId, useState } from 'react'
import UiIcon from '@/components/common/UiIcon'
import StateIcon from '@/components/common/StateIcon'
import type { FilterKey, FilterOptions, Filters } from '@/lib/activityFilters'

type Props = {
  filters: Filters
  options: FilterOptions
  onSearch: (value: string) => void
  onToggle: (key: FilterKey, value: string) => void
  onClear: () => void
  count: number
  total: number
  panelOpen: boolean
  hidden: boolean
}

const groups: { key: FilterKey; label: string }[] = [
  { key: 'member', label: '成员' },
  { key: 'city', label: '城市' },
  { key: 'year', label: '年份' },
  { key: 'type', label: '类型' },
]

export default function ActivityFilterBar(p: Props) {
  const [expanded, setExpanded] = useState(true)
  const optionsId = useId()
  const selectedCount = groups.reduce((count, { key }) => count + p.filters[key].length, 0)
  const hasFilters = Boolean(p.filters.q.trim()) || groups.some(({ key }) => p.filters[key].length > 0)

  return (
    <section
      data-map-edge="top"
      data-map-active={!p.hidden}
      aria-label="探索活动"
      inert={p.hidden}
      aria-hidden={p.hidden}
      className={`memory-filter ${p.panelOpen ? 'has-panel' : ''} ${p.hidden ? 'invisible' : ''}`}
    >
      <div className="flex items-center gap-2">
        <label className="relative block min-w-0 flex-1">
          <UiIcon name="search" className="absolute left-3 top-3.5 h-4 w-4 text-orange-600" />
          <input
            className="memory-input"
            aria-label="搜索活动"
            placeholder="搜索活动、城市或场馆"
            value={p.filters.q}
            onChange={(event) => p.onSearch(event.target.value)}
          />
        </label>
        <button
          className="memory-button shrink-0"
          type="button"
          aria-expanded={expanded}
          aria-controls={optionsId}
          onClick={() => setExpanded((value) => !value)}
        >
          <StateIcon kind="disclosure" active={expanded} />
          {expanded ? '收起筛选' : '展开筛选'}
          {!expanded && selectedCount > 0 && (
            <span className="rounded-full bg-blue-50 px-1.5 text-xs text-blue-700">
              {selectedCount}
            </span>
          )}
        </button>
      </div>

      <div id={optionsId} hidden={!expanded}>
        {groups.map(({ key, label }) => (
          <div className="memory-option-row" role="group" aria-label={`按${label}筛选`} key={key}>
            <span className="memory-option-label">{label}</span>
            <div className="memory-option-values">
              {p.options[key].map((value) => {
                const selected = p.filters[key].includes(value)
                return (
                  <button
                    key={value}
                    type="button"
                    className={`memory-option-button ${selected ? 'selected' : ''}`}
                    aria-pressed={selected}
                    onClick={() => p.onToggle(key, value)}
                  >
                    <span className="memory-option-check" aria-hidden="true">{selected ? '✓' : ''}</span>
                    {value}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="memory-filter-status">
        <span role="status" aria-live="polite">找到 {p.count} / {p.total} 场</span>
        <button className="memory-button" type="button" disabled={!hasFilters} onClick={p.onClear}>
          清空筛选
        </button>
      </div>
    </section>
  )
}
