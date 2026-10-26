import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/authStore'
import { PageLayout } from '../components/layout/PageLayout'
import { Button, Badge, Input, Select, Spinner, Modal, Card } from '../components/ui'
import { formatDate, toInputDate } from '../lib/dateUtils'
import { createAct } from '../hooks/useAct'
import type { Act } from '../types'

interface ActWithCount extends Act {
  defect_count?: number
  fixed_count?: number
  total_count?: number
}

export function ActsListPage() {
  const { user, profile } = useAuthStore()
  const navigate = useNavigate()
  const [acts, setActs] = useState<ActWithCount[]>([])
  const [loading, setLoading] = useState(true)
  const [filterBranch, setFilterBranch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterSearch, setFilterSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newAct, setNewAct] = useState({ branch: '', store_name: '', acceptance_date: '', opening_date: '' })

  const load = async () => {
    setLoading(true)
    try {
      let q = supabase.from('acts').select('*').order('created_at', { ascending: false })
      if (filterStatus !== 'all') q = q.eq('status', filterStatus)
      const { data } = await q
      if (data) {
        const actIds = data.map((a: Act) => a.id)
        const { data: itemStats } = await supabase
          .from('act_items')
          .select('act_id, has_defect, defect_status')
          .in('act_id', actIds)

        const statsMap: Record<string, { total: number; defect: number; fixed: number }> = {}
        for (const item of (itemStats || []) as { act_id: string; has_defect: boolean; defect_status: string }[]) {
          if (!statsMap[item.act_id]) statsMap[item.act_id] = { total: 0, defect: 0, fixed: 0 }
          statsMap[item.act_id].total++
          if (item.has_defect) statsMap[item.act_id].defect++
          if (item.defect_status === 'fixed') statsMap[item.act_id].fixed++
        }

        setActs(data.map((a: Act) => ({
          ...a,
          total_count: statsMap[a.id]?.total || 0,
          defect_count: statsMap[a.id]?.defect || 0,
          fixed_count: statsMap[a.id]?.fixed || 0,
        })))
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [filterStatus])

  const filtered = acts.filter(a => {
    if (filterBranch && !a.branch.toLowerCase().includes(filterBranch.toLowerCase())) return false
    if (filterSearch && !a.store_name.toLowerCase().includes(filterSearch.toLowerCase())) return false
    if (dateFrom && (!a.acceptance_date || a.acceptance_date < dateFrom)) return false
    if (dateTo && (!a.acceptance_date || a.acceptance_date > dateTo)) return false
    return true
  })

  const handleCreate = async () => {
    if (!newAct.branch || !newAct.store_name || !user) return
    setCreating(true)
    try {
      const id = await createAct(newAct.branch, newAct.store_name, newAct.acceptance_date || null, newAct.opening_date || null, user.id)
      setCreateOpen(false)
      navigate(`/acts/${id}`)
    } catch (e) {
      alert('Ошибка создания акта: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setCreating(false)
    }
  }

  const branches = [...new Set(acts.map(a => a.branch))].filter(Boolean)

  return (
    <PageLayout
      title="Акты приёмки"
      actions={
        profile?.role !== 'contractor' ? (
          <Button onClick={() => setCreateOpen(true)} size="sm">+ Новый акт</Button>
        ) : undefined
      }
    >
      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <Input
          placeholder="Поиск по магазину..."
          value={filterSearch}
          onChange={e => setFilterSearch(e.target.value)}
          className="max-w-[200px]"
        />
        <Input
          placeholder="Фильтр по филиалу..."
          value={filterBranch}
          onChange={e => setFilterBranch(e.target.value)}
          className="max-w-[150px]"
        />
        <Select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          options={[
            { value: 'all', label: 'Все статусы' },
            { value: 'in_progress', label: 'В работе' },
            { value: 'completed', label: 'Все замечания устранены' },
          ]}
          className="max-w-[180px]"
        />
        <label className="flex items-center gap-1 text-xs text-gray-500">
          Приёмка с
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm" />
        </label>
        <label className="flex items-center gap-1 text-xs text-gray-500">
          по
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm" />
        </label>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner className="h-8 w-8" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">📋</p>
          <p>Актов не найдено</p>
          {profile?.role !== 'contractor' && (
            <Button className="mt-4" onClick={() => setCreateOpen(true)}>Создать первый акт</Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(act => (
            <Card
              key={act.id}
              className="p-4 cursor-pointer hover:shadow-md transition-shadow active:bg-gray-50"
              onClick={() => navigate(`/acts/${act.id}`)}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{act.store_name}</p>
                  <p className="text-sm text-gray-500">{act.branch}</p>
                </div>
                <Badge color={act.status === 'completed' ? 'green' : 'amber'}>
                  {act.status === 'completed' ? '✓ Устранено' : 'В работе'}
                </Badge>
              </div>
              <div className="flex gap-4 text-xs text-gray-500">
                {act.acceptance_date && <span>Приёмка: {formatDate(act.acceptance_date)}</span>}
                {act.opening_date && <span>Открытие: {formatDate(act.opening_date)}</span>}
              </div>
              {(act.defect_count || 0) > 0 && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                    <div
                      className="bg-green-500 h-1.5 rounded-full"
                      style={{ width: `${Math.round(((act.fixed_count || 0) / (act.defect_count || 1)) * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500">
                    {act.fixed_count}/{act.defect_count} устр.
                  </span>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Новый акт приёмки">
        <div className="space-y-4">
          <Input
            label="Филиал *"
            value={newAct.branch}
            onChange={e => setNewAct(d => ({ ...d, branch: e.target.value }))}
            placeholder="Например: Воронеж"
          />
          <Input
            label="Название магазина *"
            value={newAct.store_name}
            onChange={e => setNewAct(d => ({ ...d, store_name: e.target.value }))}
            placeholder="Например: Магнит №1234"
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Дата приёмки</label>
            <input
              type="date"
              value={newAct.acceptance_date}
              onChange={e => setNewAct(d => ({ ...d, acceptance_date: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Дата открытия</label>
            <input
              type="date"
              value={newAct.opening_date}
              onChange={e => setNewAct(d => ({ ...d, opening_date: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <Button className="w-full" onClick={handleCreate} loading={creating} disabled={!newAct.branch || !newAct.store_name}>
            Создать акт
          </Button>
        </div>
      </Modal>
    </PageLayout>
  )
}
