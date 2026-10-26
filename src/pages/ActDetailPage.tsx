import React, { useState, useEffect, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useAct } from '../hooks/useAct'
import { useAllPhotosForAct } from '../hooks/usePhotos'
import { useAuthStore } from '../store/authStore'
import { PageLayout } from '../components/layout/PageLayout'
import { ZoneAccordion } from '../components/checklist/ZoneAccordion'
import { SummaryTable } from '../components/summary/SummaryTable'
import { ContractorAccess } from '../components/acts/ContractorAccess'
import { CommissionBlock } from '../components/commission/CommissionBlock'
import { ExcelExport } from '../components/export/ExcelExport'
import { PdfExport } from '../components/export/PdfExport'
import { Badge, Button, Input, Select, Spinner, Card, Alert } from '../components/ui'
import { formatDate, toInputDate } from '../lib/dateUtils'
import { RESPONSIBLE_OPTIONS } from '../types'
import type { ActItemWithSection } from '../hooks/useAct'

type TabType = 'checklist' | 'summary' | 'commission' | 'export' | 'access'

export function ActDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user, profile } = useAuthStore()
  const { act, items, commission, loading, error, updateItem, updateAct, getItemHistory, saveCommissionMember, computeSummary, allFixed } = useAct(id)
  const { photosByItem, load: loadPhotos } = useAllPhotosForAct(id!)
  const [tab, setTab] = useState<TabType>('checklist')
  const [search, setSearch] = useState('')
  const [filterHasDefect, setFilterHasDefect] = useState(false)
  const [filterNotFixed, setFilterNotFixed] = useState(false)
  const [filterFixed, setFilterFixed] = useState(false)
  const [filterKz, setFilterKz] = useState(false)
  const [filterOverdue, setFilterOverdue] = useState(false)
  const [filterResp, setFilterResp] = useState('all')
  const [contractorMode, setContractorMode] = useState(profile?.role === 'contractor')
  const [editActOpen, setEditActOpen] = useState(false)
  const [editActData, setEditActData] = useState({ branch: '', store_name: '', acceptance_date: '', opening_date: '' })

  useEffect(() => { loadPhotos() }, [loadPhotos])

  useEffect(() => {
    if (act) {
      setEditActData({
        branch: act.branch,
        store_name: act.store_name,
        acceptance_date: toInputDate(act.acceptance_date),
        opening_date: toInputDate(act.opening_date),
      })
    }
  }, [act])

  const today = new Date().toISOString().slice(0, 10)

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      if (search) {
        const q = search.toLowerCase()
        if (!item.name.toLowerCase().includes(q) && !String(item.number).includes(q)) return false
      }
      if (filterHasDefect && !item.has_defect) return false
      if (filterNotFixed && item.defect_status !== 'not_fixed') return false
      if (filterFixed && item.defect_status !== 'fixed') return false
      if (filterKz && !item.is_kz) return false
      if (filterOverdue) {
        if (!item.planned_fix_date || item.defect_status !== 'not_fixed') return false
        if (item.planned_fix_date >= today) return false
      }
      if (contractorMode && filterResp !== 'all' && item.responsible !== filterResp) return false
      if (contractorMode && !item.has_defect) return false
      return true
    })
  }, [items, search, filterHasDefect, filterNotFixed, filterFixed, filterKz, filterOverdue, filterResp, contractorMode, today])

  const defectCount = items.filter(i => i.has_defect).length
  const fixedCount = items.filter(i => i.defect_status === 'fixed').length

  // Зоны и подразделы берутся из снимка в строках акта; порядок — по sort_order
  const zones = useMemo(() => {
    type Sub = { id: string; name: string; items: ActItemWithSection[] }
    const byZone = new Map<string, { zone: { id: string; name: string }; subs: Map<string, Sub>; directItems: ActItemWithSection[] }>()
    for (const item of filteredItems as ActItemWithSection[]) {
      const zoneName = item.zone_name || 'Прочее'
      let z = byZone.get(zoneName)
      if (!z) { z = { zone: { id: zoneName, name: zoneName }, subs: new Map(), directItems: [] }; byZone.set(zoneName, z) }
      if (item.subsection_name) {
        let sub = z.subs.get(item.subsection_name)
        if (!sub) { sub = { id: `${zoneName}/${item.subsection_name}`, name: item.subsection_name, items: [] }; z.subs.set(item.subsection_name, sub) }
        sub.items.push(item)
      } else {
        z.directItems.push(item)
      }
    }
    return [...byZone.values()].map(z => ({
      zone: z.zone,
      subsections: [...z.subs.values()],
      directItems: z.directItems,
    }))
  }, [filteredItems])

  const handleUpdateItem = async (itemId: string, updates: Record<string, unknown>) => {
    const { status_comment, ...rest } = updates
    await updateItem(itemId, rest as Parameters<typeof updateItem>[1], user?.id, status_comment as string | undefined)
  }

  const summaryRows = computeSummary()

  if (loading) return (
    <PageLayout title="Акт приёмки" backTo="/">
      <div className="flex justify-center py-12"><Spinner className="h-8 w-8" /></div>
    </PageLayout>
  )

  if (error || !act) return (
    <PageLayout title="Акт приёмки" backTo="/">
      <Alert type="error">{error || 'Акт не найден'}</Alert>
    </PageLayout>
  )

  const tabs: { id: TabType; label: string }[] = [
    { id: 'checklist', label: 'Чек-лист' },
    { id: 'summary', label: 'Сводка' },
    ...(profile?.role !== 'contractor' ? [{ id: 'commission' as TabType, label: 'Комиссия' }] : []),
    { id: 'export', label: 'Экспорт' },
    ...(profile?.role !== 'contractor' ? [{ id: 'access' as TabType, label: 'Доступ' }] : []),
  ]

  return (
    <PageLayout title={act.store_name} backTo="/">
      {/* Act header */}
      <Card className="p-4 mb-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex-1">
            <h2 className="font-bold text-gray-900">{act.store_name}</h2>
            <p className="text-sm text-gray-500">{act.branch}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge color={act.status === 'completed' ? 'green' : 'amber'}>
              {act.status === 'completed' ? '✓ Устранено' : 'В работе'}
            </Badge>
            {profile?.role !== 'contractor' && (
              <Button size="sm" variant="ghost" onClick={() => setEditActOpen(true)}>✏</Button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div><span className="text-gray-500">Приёмка:</span> {formatDate(act.acceptance_date) || '—'}</div>
          <div><span className="text-gray-500">Открытие:</span> {formatDate(act.opening_date) || '—'}</div>
          {act.last_fix_date && (
            <div className="col-span-2"><span className="text-gray-500">Последнее устранение:</span> {formatDate(act.last_fix_date)}</div>
          )}
        </div>

      </Card>

      {/* Tabs */}
      <div className="flex border-b mb-4 overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              tab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'checklist' && (
        <>
          {/* Filters row */}
          <div className="sticky top-14 z-30 bg-gray-50 -mx-3 px-3 pt-2 pb-2 mb-3 space-y-2 border-b border-gray-200 shadow-sm">
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <span className="font-medium whitespace-nowrap">Устранено {fixedCount} из {defectCount}</span>
              <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                <div className="bg-green-500 h-1.5 rounded-full transition-all" style={{ width: `${defectCount ? Math.round(fixedCount / defectCount * 100) : 0}%` }} />
              </div>
            </div>
            <Input
              placeholder="🔍 Поиск по пунктам..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <div className="flex gap-2 overflow-x-auto pb-1">
              {[
                { label: 'С замечаниями', val: filterHasDefect, set: setFilterHasDefect },
                { label: 'Не устранено', val: filterNotFixed, set: setFilterNotFixed },
                { label: 'Устранено', val: filterFixed, set: setFilterFixed },
                { label: 'Только КЗ', val: filterKz, set: setFilterKz },
                { label: 'Просроченные', val: filterOverdue, set: setFilterOverdue },
              ].map(f => (
                <button
                  key={f.label}
                  onClick={() => f.set(!f.val)}
                  className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                    f.val ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2 items-center">
              <Select
                value={filterResp}
                onChange={e => setFilterResp(e.target.value)}
                options={[
                  { value: 'all', label: 'Все ответственные' },
                  ...RESPONSIBLE_OPTIONS.map(r => ({ value: r, label: r })),
                ]}
                className="text-sm"
              />
              {profile?.role !== 'contractor' && <button
                onClick={() => setContractorMode(m => !m)}
                className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${contractorMode ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}
              >
                Режим подрядчика
              </button>}
            </div>
          </div>

          {zones.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <p>Пунктов не найдено</p>
              {(search || filterHasDefect || filterNotFixed || filterFixed || filterKz || filterOverdue) && (
                <Button variant="ghost" size="sm" className="mt-2" onClick={() => {
                  setSearch(''); setFilterHasDefect(false); setFilterNotFixed(false)
                  setFilterFixed(false); setFilterKz(false); setFilterOverdue(false)
                }}>
                  Сбросить фильтры
                </Button>
              )}
            </div>
          ) : (
            <div>
              {zones.map(({ zone, subsections, directItems }) => (
                <ZoneAccordion
                  key={zone.id}
                  zoneName={zone.name}
                  subsections={subsections}
                  directItems={directItems}
                  actId={act.id}
                  onUpdate={handleUpdateItem}
                  onGetHistory={getItemHistory}
                  photosByItem={Object.fromEntries(
                    Object.entries(photosByItem).map(([k, v]) => [k, v.map(p => ({ type: p.type }))])
                  )}
                  contractorMode={contractorMode}
                />
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'summary' && (
        <Card className="p-4">
          <h2 className="font-semibold text-gray-800 mb-4">Сводка по замечаниям</h2>
          <SummaryTable rows={summaryRows} />
        </Card>
      )}

      {tab === 'access' && <ContractorAccess actId={act.id} />}

      {tab === 'commission' && (
        <CommissionBlock
          actId={act.id}
          members={commission}
          act={act}
          allFixed={allFixed}
          gcHasOpenDefects={items.some(i => i.responsible === 'Ген.подрядчик по СМР' && i.has_defect && i.defect_status === 'not_fixed')}
          onSaveMember={saveCommissionMember}
          onUpdateAct={updateAct}
        />
      )}

      {tab === 'export' && (
        <Card className="p-4 space-y-4">
          <h2 className="font-semibold text-gray-800">Экспорт документов</h2>
          <div>
            <p className="text-sm text-gray-600 mb-2">Excel-акт (формат образца)</p>
            <ExcelExport act={act} items={items} commission={commission} summaryRows={summaryRows} photosByItem={photosByItem} />
          </div>
          <div>
            <p className="text-sm text-gray-600 mb-2">PDF отчёт по замечаниям</p>
            <PdfExport act={act} items={items} photosByItem={photosByItem} />
          </div>
        </Card>
      )}

      {/* Edit act modal */}
      {editActOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setEditActOpen(false)} />
          <div className="relative bg-white w-full sm:max-w-md sm:rounded-xl max-h-[90vh] overflow-y-auto rounded-t-2xl p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">Редактировать акт</h3>
              <button onClick={() => setEditActOpen(false)}>✕</button>
            </div>
            <div className="space-y-3">
              <Input label="Филиал" value={editActData.branch} onChange={e => setEditActData(d => ({ ...d, branch: e.target.value }))} />
              <Input label="Название магазина" value={editActData.store_name} onChange={e => setEditActData(d => ({ ...d, store_name: e.target.value }))} />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Дата приёмки</label>
                <input type="date" value={editActData.acceptance_date} onChange={e => setEditActData(d => ({ ...d, acceptance_date: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Дата открытия</label>
                <input type="date" value={editActData.opening_date} onChange={e => setEditActData(d => ({ ...d, opening_date: e.target.value }))} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
              <Button className="w-full" onClick={async () => {
                await updateAct({
                  branch: editActData.branch,
                  store_name: editActData.store_name,
                  acceptance_date: editActData.acceptance_date || null,
                  opening_date: editActData.opening_date || null,
                })
                setEditActOpen(false)
              }}>
                Сохранить
              </Button>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  )
}
