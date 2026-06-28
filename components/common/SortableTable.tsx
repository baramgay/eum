'use client'

import { Fragment, useMemo, useState } from 'react'
import { SortAsc, SortDesc } from 'lucide-react'
import clsx from 'clsx'
import { twMerge } from 'tailwind-merge'

function cn(...inputs: (string | undefined | null | false | Record<string, boolean>)[]) {
  return twMerge(clsx(inputs))
}

export type TableColumnAlign = 'left' | 'center' | 'right'

export interface TableColumn<T> {
  key: string
  label: string
  align?: TableColumnAlign
  sortable?: boolean
  sortValue?: (row: T, idx: number) => string | number | Date | undefined | null
  width?: string | number
  className?: string
  thClassName?: string
  render: (row: T, idx: number) => React.ReactNode
}

interface SortableTableProps<T> {
  caption: string
  columns: TableColumn<T>[]
  data: T[]
  keyExtractor: (row: T, idx: number) => string
  className?: string
  tableClassName?: string
  containerClassName?: string
  ariaLabel?: string
  empty?: React.ReactNode
  defaultSortKey?: string
  defaultSortDesc?: boolean
  maxHeight?: string | number
  minWidth?: string | number
  expandedRow?: (row: T, idx: number) => React.ReactNode | null
}

const alignClass: Record<TableColumnAlign, string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
}

export default function SortableTable<T>({
  caption,
  columns,
  data,
  keyExtractor,
  className,
  tableClassName,
  containerClassName,
  ariaLabel,
  empty,
  defaultSortKey,
  defaultSortDesc = false,
  maxHeight,
  minWidth,
  expandedRow,
}: SortableTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(defaultSortKey ?? null)
  const [sortDesc, setSortDesc] = useState(defaultSortDesc)

  function toggleSort(key: string) {
    if (sortKey === key) {
      if (sortDesc) {
        setSortKey(null)
        setSortDesc(false)
      } else {
        setSortDesc(true)
      }
    } else {
      setSortKey(key)
      setSortDesc(false)
    }
  }

  const sortedData = useMemo(() => {
    if (!sortKey) return data
    const col = columns.find(c => c.key === sortKey)
    if (!col || !col.sortValue) return data

    const sorted = data.map((row, idx) => ({ row, idx }))
    sorted.sort((a, b) => {
      const va = col.sortValue!(a.row, a.idx)
      const vb = col.sortValue!(b.row, b.idx)
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1

      let cmp = 0
      if (typeof va === 'number' && typeof vb === 'number') {
        cmp = va - vb
      } else if (va instanceof Date && vb instanceof Date) {
        cmp = va.getTime() - vb.getTime()
      } else {
        cmp = String(va).localeCompare(String(vb), 'ko')
      }
      return sortDesc ? -cmp : cmp
    })
    return sorted.map(s => s.row)
  }, [data, sortKey, sortDesc, columns])

  const containerStyle: React.CSSProperties = {}
  if (maxHeight) containerStyle.maxHeight = typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight

  const tableStyle: React.CSSProperties = {}
  if (minWidth) tableStyle.minWidth = typeof minWidth === 'number' ? `${minWidth}px` : minWidth

  return (
    <div
      role="region"
      className={cn(
        'overflow-x-auto rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
        containerClassName
      )}
      tabIndex={0} // eslint-disable-line jsx-a11y/no-noninteractive-tabindex -- 키보드 사용자가 가로 스크롤할 수 있도록 허용
      aria-label={ariaLabel ?? caption}
      style={containerStyle}
    >
      <table className={cn('w-full text-sm', tableClassName)} style={tableStyle}>
        <caption className="caption-top text-left text-sm text-gray-500 dark:text-gray-400 px-4 pt-3 pb-2">
          {caption}
        </caption>
        <thead className="bg-gray-50 dark:bg-gray-900 border-b dark:border-gray-700">
          <tr>
            {columns.map(col => {
              const active = sortKey === col.key
              return (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={col.sortable ? (active ? (sortDesc ? 'descending' : 'ascending') : 'none') : undefined}
                  className={cn(
                    'px-4 py-2 font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap transition-colors duration-150',
                    alignClass[col.align ?? 'left'],
                    col.sortable && 'cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-gray-700/60 hover:text-gray-800 dark:hover:text-gray-200',
                    col.sortable && active && 'bg-gray-100 dark:bg-gray-700/60 text-gray-900 dark:text-gray-50',
                    col.thClassName
                  )}
                  style={col.width ? { width: col.width } : undefined}
                  onClick={col.sortable ? () => toggleSort(col.key) : undefined}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {col.sortable && (
                      active
                        ? (sortDesc ? <SortDesc className="w-3 h-3" /> : <SortAsc className="w-3 h-3" />)
                        : <SortAsc className="w-3 h-3 opacity-25" />
                    )}
                  </span>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody className={cn('divide-y divide-gray-100', className)}>
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-6">
                {empty ?? (
                  <div className="text-center text-sm text-gray-400 dark:text-gray-300">데이터가 없습니다</div>
                )}
              </td>
            </tr>
          ) : (
            sortedData.map((row, idx) => {
              const rowKey = keyExtractor(row, idx)
              const expanded = expandedRow?.(row, idx)
              return (
                <Fragment key={rowKey}>
                  <tr className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors duration-100">
                    {columns.map(col => (
                      <td
                        key={col.key}
                        className={cn('px-4 py-2', alignClass[col.align ?? 'left'], col.className)}
                      >
                        {col.render(row, idx)}
                      </td>
                    ))}
                  </tr>
                  {expanded && (
                    <tr className="bg-gray-50/50 dark:bg-gray-950/50">
                      <td colSpan={columns.length}>{expanded}</td>
                    </tr>
                  )}
                </Fragment>
              )
            })
          )}
        </tbody>
      </table>
    </div>
  )
}
