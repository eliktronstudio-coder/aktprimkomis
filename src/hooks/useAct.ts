import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Act, ActItem, CommissionMember, SummaryRow, StatusHistoryEntry } from '../types'
import { RESPONSIBLE_OPTIONS, DEFAULT_COMMISSION_POSITIONS } from '../types'
import { todayISO } from '../lib/dateUtils'
import { enqueue, isNetworkError, updateItemNow } from '../lib/offlineQueue'

export interface ActItemWithSection extends ActItem {
  section?: { id: string; name: string; type: string; parent_id: string | null }
}

export function useAct(actId: string | undefined) {
  const [act, setAct] = useState<Act | null>(null)
  const [items, setItems] = useState<ActItemWithSection[]>([])
  const [commission, setCommission] = useState<CommissionMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!actId) return
    setLoading(true)
    try {
      const [{ data: actData }, { data: itemsData }, { data: commData }] = await Promise.all([
        supabase.from('acts').select('*').eq('id', actId).single(),
        supabase.from('act_items').select('*').eq('act_id', actId).order('sort_order'),
        supabase.from('commission_members').select('*').eq('act_id', actId).order('sort_order'),
      ])
      if (actData) setAct(actData as Act)
      if (itemsData) setItems(itemsData as ActItemWithSection[])
      if (commData) setCommission(commData as CommissionMember[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки акта')
    } finally {
      setLoading(false)
    }
  }, [actId])

  useEffect(() => { load() }, [load])

  const updateItem = useCallback(async (itemId: string, updates: Partial<ActItem>, userId?: string, comment?: string) => {
    const current = items.find(i => i.id === itemId)
    if (!current) return

    const finalUpdates: Partial<ActItem> & { updated_at: string } = {
      ...updates,
      updated_at: new Date().toISOString(),
    }

    if (updates.defect_status === 'fixed' && !updates.actual_fix_date) {
      finalUpdates.actual_fix_date = todayISO()
    }
    if (updates.defect_status === 'fixed' && userId) {
      finalUpdates.fixed_by = userId
      finalUpdates.fixed_at = new Date().toISOString()
    }
    if (updates.defect_status === 'not_fixed') {
      finalUpdates.actual_fix_date = null
      finalUpdates.fixed_by = null
      finalUpdates.fixed_at = null
    }
    if (updates.has_defect === false) {
      finalUpdates.defect_status = 'no_defect'
      finalUpdates.note = null
      finalUpdates.planned_fix_date = null
      finalUpdates.actual_fix_date = null
    }
    if (updates.has_defect === true && !current.has_defect) {
      finalUpdates.defect_status = 'not_fixed'
    }

    const history = updates.defect_status && updates.defect_status !== current.defect_status && userId
      ? { from_status: current.defect_status, to_status: updates.defect_status, changed_by: userId, comment: comment || null }
      : undefined
    const payload = { id: itemId, updates: finalUpdates as Record<string, unknown>, history }

    // Сначала обновляем экран, затем отправляем; без связи изменение уходит в очередь
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, ...finalUpdates } as ActItemWithSection : i))
    try {
      if (!navigator.onLine) throw new TypeError('offline')
      await updateItemNow(payload)
    } catch (err) {
      if (isNetworkError(err)) {
        await enqueue('update_item', payload)
        return
      }
      await load()
      throw err
    }
    await refreshAct()
  }, [items, load])

  const refreshAct = async () => {
    if (!actId) return
    const { data } = await supabase.from('acts').select('*').eq('id', actId).single()
    if (data) setAct(data as Act)
  }

  const updateAct = async (updates: Partial<Act>) => {
    if (!actId) return
    const { error: err } = await supabase
      .from('acts')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', actId)
    if (err) throw err
    await refreshAct()
  }

  const getItemHistory = async (itemId: string): Promise<StatusHistoryEntry[]> => {
    const { data } = await supabase
      .from('status_history')
      .select('*, profile:profiles(full_name,email)')
      .eq('act_item_id', itemId)
      .order('created_at', { ascending: false })
    return (data || []) as StatusHistoryEntry[]
  }

  const saveCommissionMember = async (member: Partial<CommissionMember> & { act_id: string }) => {
    if (member.id) {
      const { error: err } = await supabase
        .from('commission_members')
        .update(member)
        .eq('id', member.id)
      if (err) throw err
    } else {
      const { error: err } = await supabase
        .from('commission_members')
        .insert(member)
      if (err) throw err
    }
    const { data } = await supabase
      .from('commission_members')
      .select('*')
      .eq('act_id', actId!)
      .order('sort_order')
    if (data) setCommission(data as CommissionMember[])
  }

  const computeSummary = (): SummaryRow[] => {
    return RESPONSIBLE_OPTIONS.map(resp => {
      const respItems = items.filter(i => i.responsible === resp && i.has_defect)
      const kzItems = respItems.filter(i => i.is_kz)
      const nonKzItems = respItems.filter(i => !i.is_kz)
      return {
        responsible: resp,
        kz_total: kzItems.length,
        kz_not_fixed: kzItems.filter(i => i.defect_status === 'not_fixed').length,
        kz_fixed: kzItems.filter(i => i.defect_status === 'fixed').length,
        non_kz_total: nonKzItems.length,
        non_kz_not_fixed: nonKzItems.filter(i => i.defect_status === 'not_fixed').length,
        non_kz_fixed: nonKzItems.filter(i => i.defect_status === 'fixed').length,
      }
    })
  }

  const allFixed = items.filter(i => i.has_defect).every(i => i.defect_status === 'fixed')

  return {
    act, items, commission, loading, error,
    reload: load, updateItem, updateAct, getItemHistory,
    saveCommissionMember, computeSummary, allFixed,
  }
}

export async function createAct(
  branch: string,
  storeName: string,
  acceptanceDate: string | null,
  openingDate: string | null,
  createdBy: string,
  customItems?: CustomActItem[],
): Promise<string> {
  const { data: actData, error: actErr } = await supabase
    .from('acts')
    .insert({ branch, store_name: storeName, acceptance_date: acceptanceDate, opening_date: openingDate, created_by: createdBy })
    .select()
    .single()
  if (actErr || !actData) throw actErr || new Error('Failed to create act')

  const actId = actData.id

  const actItems = customItems
    ? customItems.map(it => ({ ...it, act_id: actId }))
    : await itemsFromTemplate(actId)

  const batchSize = 50
  for (let i = 0; i < actItems.length; i += batchSize) {
    const { error: itemErr } = await supabase
      .from('act_items')
      .insert(actItems.slice(i, i + batchSize))
    if (itemErr) throw itemErr
  }

  const defaultCommission = DEFAULT_COMMISSION_POSITIONS.map(m => ({ ...m, act_id: actId }))
  await supabase.from('commission_members').insert(defaultCommission)

  return actId
}

export interface CustomActItem {
  zone_name: string | null
  subsection_name: string | null
  number: number
  name: string
  responsible: string
  is_kz: boolean
  sort_order: number
}

async function itemsFromTemplate(actId: string) {
  const [{ data: sections }, { data: templateItems }] = await Promise.all([
    supabase.from('template_sections').select('*'),
    supabase.from('template_items').select('*'),
  ])

  if (!templateItems || templateItems.length === 0) return []

  type Sec = { id: string; name: string; type: string; parent_id: string | null; sort_order: number }
  const secById = new Map<string, Sec>((sections as Sec[] | null ?? []).map(x => [x.id, x]))
  const resolve = (sectionId: string | null) => {
    const sec = sectionId ? secById.get(sectionId) : undefined
    const zone = sec?.type === 'subsection' ? (sec.parent_id ? secById.get(sec.parent_id) : undefined) : sec
    return { zone, sub: sec?.type === 'subsection' ? sec : undefined }
  }
  const ordered = [...(templateItems as Array<ActItem & { section_id: string | null }>)].sort((x, y) => {
    const rx = resolve(x.section_id), ry = resolve(y.section_id)
    return (rx.zone?.sort_order ?? 0) - (ry.zone?.sort_order ?? 0)
      || (rx.sub?.sort_order ?? -1) - (ry.sub?.sort_order ?? -1)
      || x.sort_order - y.sort_order
  })
  const actItems = ordered.map((ti, idx) => {
    const { zone, sub } = resolve(ti.section_id)
    return {
      act_id: actId,
      template_item_id: ti.id,
      section_id: ti.section_id,
      zone_name: zone?.name ?? null,
      subsection_name: sub?.name ?? null,
      number: idx + 1,
      name: ti.name,
      responsible: ti.responsible,
      is_kz: ti.is_kz,
      sort_order: idx,
    }
  })
  return actItems
}
