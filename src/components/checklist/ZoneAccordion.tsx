import React, { useState } from 'react'
import { CheckItem } from './CheckItem'
import type { ActItemWithSection } from '../../hooks/useAct'
import type { StatusHistoryEntry } from '../../types'

interface ZoneAccordionProps {
  zoneName: string
  subsections: Array<{
    id: string
    name: string
    items: ActItemWithSection[]
  }>
  directItems: ActItemWithSection[]
  actId: string
  onUpdate: (itemId: string, updates: Record<string, unknown>) => Promise<void>
  onGetHistory: (itemId: string) => Promise<StatusHistoryEntry[]>
  photosByItem?: Record<string, { type: string }[]>
  contractorMode?: boolean
}

function SubsectionBlock({
  name,
  items,
  actId,
  onUpdate,
  onGetHistory,
  photosByItem,
  contractorMode,
}: {
  name: string
  items: ActItemWithSection[]
  actId: string
  onUpdate: (itemId: string, updates: Record<string, unknown>) => Promise<void>
  onGetHistory: (itemId: string) => Promise<StatusHistoryEntry[]>
  photosByItem?: Record<string, { type: string }[]>
  contractorMode?: boolean
}) {
  if (items.length === 0) return null
  return (
    <div className="mb-3">
      <div className="bg-gray-100 text-gray-600 text-xs font-semibold px-3 py-1.5 rounded mb-1.5">
        {name}
      </div>
      {items.map(item => (
        <CheckItem
          key={item.id}
          item={item}
          actId={actId}
          onUpdate={onUpdate}
          onGetHistory={onGetHistory}
          photosByItem={photosByItem}
          contractorMode={contractorMode}
        />
      ))}
    </div>
  )
}

export function ZoneAccordion({
  zoneName,
  subsections,
  directItems,
  actId,
  onUpdate,
  onGetHistory,
  photosByItem,
  contractorMode,
}: ZoneAccordionProps) {
  const [open, setOpen] = useState(false)

  const allItems = [...directItems, ...subsections.flatMap(s => s.items)]
  const defectCount = allItems.filter(i => i.has_defect).length
  const fixedCount = allItems.filter(i => i.defect_status === 'fixed').length
  const hasAny = allItems.length > 0

  return (
    <div className="mb-3">
      <button
        className="w-full flex items-center gap-3 px-4 py-3 bg-blue-700 text-white rounded-xl text-left hover:bg-blue-800 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <span className="flex-1 font-semibold text-sm">{zoneName}</span>
        {defectCount > 0 && (
          <span className="text-xs bg-blue-600 px-2 py-0.5 rounded-full">
            {fixedCount}/{defectCount} устр.
          </span>
        )}
        <span className="text-sm">{open ? '▲' : '▼'}</span>
      </button>

      {open && hasAny && (
        <div className="mt-2 px-1">
          {subsections.map(sub => (
            <SubsectionBlock
              key={sub.id}
              name={sub.name}
              items={sub.items}
              actId={actId}
              onUpdate={onUpdate}
              onGetHistory={onGetHistory}
              photosByItem={photosByItem}
              contractorMode={contractorMode}
            />
          ))}
          {directItems.length > 0 && directItems.map(item => (
            <CheckItem
              key={item.id}
              item={item}
              actId={actId}
              onUpdate={onUpdate}
              onGetHistory={onGetHistory}
              photosByItem={photosByItem}
              contractorMode={contractorMode}
            />
          ))}
        </div>
      )}
    </div>
  )
}
