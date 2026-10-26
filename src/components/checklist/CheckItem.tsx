import React, { useState } from 'react'
import { Badge, Toggle, Button, Textarea, Select, Input } from '../ui'
import { PhotoUploader } from '../photos/PhotoUploader'
import { isOverdue, formatDate, formatDateTime, toInputDate, todayISO } from '../../lib/dateUtils'
import { RESPONSIBLE_OPTIONS } from '../../types'
import type { ActItemWithSection } from '../../hooks/useAct'
import type { StatusHistoryEntry } from '../../types'
import { useAuthStore } from '../../store/authStore'

const STATUS_LABELS: Record<string, string> = {
  no_defect: 'Нет замечаний',
  not_fixed: 'Замечание не устранено',
  fixed: 'Замечание устранено',
}

const STATUS_COLORS: Record<string, 'gray' | 'red' | 'green' | 'amber'> = {
  no_defect: 'gray',
  not_fixed: 'red',
  fixed: 'green',
}

interface CheckItemProps {
  item: ActItemWithSection
  actId: string
  onUpdate: (itemId: string, updates: Record<string, unknown>) => Promise<void>
  onGetHistory: (itemId: string) => Promise<StatusHistoryEntry[]>
  photosByItem?: Record<string, { type: string }[]>
  contractorMode?: boolean
}

export function CheckItem({ item, actId, onUpdate, onGetHistory, photosByItem, contractorMode }: CheckItemProps) {
  const { user, profile } = useAuthStore()
  const [expanded, setExpanded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [history, setHistory] = useState<StatusHistoryEntry[]>([])
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [note, setNote] = useState(item.note || '')
  const [planned, setPlanned] = useState(toInputDate(item.planned_fix_date))
  const [responsible, setResponsible] = useState(item.responsible)
  const [actualDate, setActualDate] = useState(toInputDate(item.actual_fix_date))
  const [fixComment, setFixComment] = useState('')
  const [statusComment, setStatusComment] = useState('')

  const overdue = isOverdue(item.planned_fix_date, item.defect_status)
  const defectPhotos = photosByItem?.[item.id]?.filter(p => p.type === 'defect') || []
  const fixedPhotos = photosByItem?.[item.id]?.filter(p => p.type === 'fixed') || []
  const canEdit = !contractorMode
  const canMarkFixed = item.defect_status === 'not_fixed' && fixedPhotos.length > 0

  const save = async (updates: Record<string, unknown>) => {
    setSaving(true)
    try {
      await onUpdate(item.id, { ...updates, updated_at: new Date().toISOString() })
    } finally {
      setSaving(false)
    }
  }

  const handleToggleDefect = () => {
    if (contractorMode) return
    if (item.has_defect && (item.note || defectPhotos.length > 0 || fixedPhotos.length > 0)) {
      if (!window.confirm('Снять замечание? Примечание и даты будут очищены.')) return
    }
    save({ has_defect: !item.has_defect })
  }

  const handleMarkFixed = async () => {
    await save({
      defect_status: 'fixed',
      actual_fix_date: actualDate || todayISO(),
      fixed_by: user?.id,
      fixed_at: new Date().toISOString(),
      status_comment: statusComment.trim() || undefined,
    })
    setStatusComment('')
  }

  const handleReturnNotFixed = async () => {
    await save({ defect_status: 'not_fixed', status_comment: statusComment.trim() || undefined })
    setStatusComment('')
  }

  const handleSaveFields = async () => {
    await save({ note, planned_fix_date: planned || null, responsible })
  }

  const loadHistory = async () => {
    if (!historyLoaded) {
      const h = await onGetHistory(item.id)
      setHistory(h)
      setHistoryLoaded(true)
    }
  }

  const rowBg = overdue
    ? 'border-l-4 border-amber-400 bg-amber-50'
    : item.defect_status === 'not_fixed'
    ? 'border-l-4 border-red-300 bg-red-50'
    : item.defect_status === 'fixed'
    ? 'border-l-4 border-green-300 bg-green-50'
    : 'border-l-4 border-gray-100'

  return (
    <div className={`rounded-lg mb-1.5 overflow-hidden border border-gray-100 ${rowBg}`}>
      {/* Compact row */}
      <div className="px-3 py-2.5">
        <button
          type="button"
          className="w-full flex items-start gap-2 text-left focus:outline-none"
          onClick={() => { setExpanded(e => !e); if (!expanded) loadHistory() }}
        >
          <span className="text-xs text-gray-400 w-7 shrink-0 font-mono pt-0.5">{item.number}</span>
          <span className="flex-1 text-sm text-gray-800 break-words">{item.name}</span>
          <span className="text-gray-400 text-sm pt-0.5">{expanded ? '▲' : '▼'}</span>
        </button>
        <div className="flex flex-wrap items-center gap-1.5 mt-2 pl-9">
          {item.is_kz && <Badge color="red">КЗ</Badge>}
          <Badge color={STATUS_COLORS[item.defect_status]}>{STATUS_LABELS[item.defect_status]}</Badge>
          {overdue && <Badge color="amber">Просрочено</Badge>}
          <span className="flex-1" />
          <Toggle
            checked={item.has_defect}
            onChange={handleToggleDefect}
            disabled={contractorMode || saving}
            labelOn="Да"
            labelOff="Нет"
          />
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-3 pb-3 border-t border-gray-100 space-y-3">
          {item.has_defect && (
            <>
              {/* Responsible */}
              <Select
                label="Ответственный"
                value={responsible}
                onChange={e => setResponsible(e.target.value)}
                disabled={!canEdit}
                options={RESPONSIBLE_OPTIONS.map(r => ({ value: r, label: r }))}
              />

              {/* Planned date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Плановая дата устранения</label>
                <input
                  type="date"
                  value={planned}
                  onChange={e => setPlanned(e.target.value)}
                  disabled={!canEdit}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {overdue && (
                  <p className="mt-1 text-xs text-amber-600">⚠ Просрочено ({formatDate(item.planned_fix_date)})</p>
                )}
              </div>

              {/* Note */}
              <Textarea
                label="Примечание (описание замечания)"
                value={note}
                onChange={e => setNote(e.target.value)}
                disabled={!canEdit}
                placeholder="Опишите замечание..."
              />

              {canEdit && (
                <Button variant="secondary" size="sm" onClick={handleSaveFields} loading={saving}>
                  Сохранить
                </Button>
              )}

              {/* Photos: before / after side by side */}
              <div className="grid grid-cols-2 gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-700 mb-1">До (замечание)</p>
                  {defectPhotos.length === 0 && (
                    <p className="text-xs text-amber-600 mb-1">⚠ Нет фото замечания</p>
                  )}
                  {!note.trim() && (
                    <p className="text-xs text-amber-600 mb-1">⚠ Нет примечания</p>
                  )}
                  <PhotoUploader actId={actId} actItemId={item.id} type="defect" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-700 mb-1">После (устранено)</p>
                  <PhotoUploader actId={actId} actItemId={item.id} type="fixed" />
                </div>
              </div>

              {/* Status actions */}
              <div className="border-t pt-3 space-y-2">
                <p className="text-sm font-medium text-gray-700">Статус устранения</p>

                {item.defect_status === 'not_fixed' && (
                  <div className="space-y-2">
                    <Textarea
                      label="Комментарий к изменению статуса"
                      value={statusComment}
                      onChange={e => setStatusComment(e.target.value)}
                      placeholder="Необязательно"
                    />
                    <div className="flex gap-2 items-end">
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-gray-700 mb-1">Фактическая дата</label>
                        <input
                          type="date"
                          value={actualDate || todayISO()}
                          onChange={e => setActualDate(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                      </div>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={handleMarkFixed}
                        disabled={!canMarkFixed}
                        loading={saving}
                      >
                        ✓ Устранено
                      </Button>
                    </div>
                    {fixedPhotos.length === 0 && (
                      <p className="text-xs text-red-500">Чтобы отметить «Устранено», загрузите хотя бы одно фото в колонке «После»</p>
                    )}
                  </div>
                )}

                {item.defect_status === 'fixed' && (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <Badge color="green">Замечание устранено</Badge>
                      {item.actual_fix_date && <span className="text-gray-500">{formatDate(item.actual_fix_date)}</span>}
                      {item.fixed_at && <span className="text-xs text-gray-400">отмечено {formatDateTime(item.fixed_at)}</span>}
                    </div>
                    {profile?.role !== 'contractor' && (
                      <>
                        <Textarea
                          label="Причина возврата"
                          value={statusComment}
                          onChange={e => setStatusComment(e.target.value)}
                          placeholder="Например: устранено некачественно"
                        />
                        <Button variant="outline" size="sm" onClick={handleReturnNotFixed} loading={saving}>
                          ↩ Вернуть «Не устранено»
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* History */}
              {historyLoaded && history.length > 0 && (
                <div className="border-t pt-3">
                  <p className="text-xs font-medium text-gray-500 mb-2">История изменений</p>
                  <div className="space-y-1">
                    {history.map(h => (
                      <div key={h.id} className="text-xs text-gray-500 flex gap-2">
                        <span className="text-gray-400">{formatDateTime(h.created_at)}</span>
                        <span>{h.from_status ? STATUS_LABELS[h.from_status] : '—'} → {STATUS_LABELS[h.to_status] || h.to_status}</span>
                        {h.profile && <span className="text-gray-400">{h.profile.full_name || h.profile.email}</span>}
                        {h.comment && <span className="text-gray-600">— {h.comment}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
