import React from 'react'
import type { SummaryRow } from '../../types'

interface SummaryTableProps {
  rows: SummaryRow[]
}

function Table({ rows, isKz }: { rows: SummaryRow[]; isKz: boolean }) {
  const totals = rows.reduce(
    (acc, r) => {
      const total = isKz ? r.kz_total : r.non_kz_total
      const notFixed = isKz ? r.kz_not_fixed : r.non_kz_not_fixed
      const fixed = isKz ? r.kz_fixed : r.non_kz_fixed
      return {
        total: acc.total + total,
        notFixed: acc.notFixed + notFixed,
        fixed: acc.fixed + fixed,
      }
    },
    { total: 0, notFixed: 0, fixed: 0 }
  )

  const displayRows = rows.filter(r => (isKz ? r.kz_total : r.non_kz_total) > 0)

  if (totals.total === 0) return (
    <p className="text-sm text-gray-400 italic">Нет замечаний</p>
  )

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="bg-gray-100">
            <th className="text-left px-2 py-2 font-semibold text-gray-600 border border-gray-200">Ответственный</th>
            <th className="px-2 py-2 font-semibold text-gray-600 border border-gray-200 text-center">Всего</th>
            <th className="px-2 py-2 font-semibold text-red-600 border border-gray-200 text-center">Не устранено</th>
            <th className="px-2 py-2 font-semibold text-green-600 border border-gray-200 text-center">Устранено</th>
          </tr>
        </thead>
        <tbody>
          {displayRows.map(r => {
            const total = isKz ? r.kz_total : r.non_kz_total
            const notFixed = isKz ? r.kz_not_fixed : r.non_kz_not_fixed
            const fixed = isKz ? r.kz_fixed : r.non_kz_fixed
            return (
              <tr key={r.responsible} className="border-b hover:bg-gray-50">
                <td className="px-2 py-1.5 border border-gray-200 text-gray-700">{r.responsible}</td>
                <td className="px-2 py-1.5 border border-gray-200 text-center font-medium">{total}</td>
                <td className="px-2 py-1.5 border border-gray-200 text-center text-red-600 font-medium">{notFixed}</td>
                <td className="px-2 py-1.5 border border-gray-200 text-center text-green-600 font-medium">{fixed}</td>
              </tr>
            )
          })}
          <tr className="bg-gray-50 font-semibold">
            <td className="px-2 py-1.5 border border-gray-200">ИТОГО</td>
            <td className="px-2 py-1.5 border border-gray-200 text-center">{totals.total}</td>
            <td className="px-2 py-1.5 border border-gray-200 text-center text-red-600">{totals.notFixed}</td>
            <td className="px-2 py-1.5 border border-gray-200 text-center text-green-600">{totals.fixed}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

export function SummaryTable({ rows }: SummaryTableProps) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-red-700 mb-2">Критичные замечания (КЗ)</h3>
        <Table rows={rows} isKz={true} />
      </div>
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Не критичные замечания</h3>
        <Table rows={rows} isKz={false} />
      </div>
    </div>
  )
}
