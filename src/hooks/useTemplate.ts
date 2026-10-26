import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { TemplateSection, TemplateItem } from '../types'

export interface TemplateSectionWithItems extends TemplateSection {
  subsections: Array<TemplateSection & { items: TemplateItem[] }>
  items: TemplateItem[]
}

export function useTemplate() {
  const [sections, setSections] = useState<TemplateSectionWithItems[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const [{ data: sectData }, { data: itemData }] = await Promise.all([
        supabase.from('template_sections').select('*').order('sort_order'),
        supabase.from('template_items').select('*').order('sort_order').order('number'),
      ])

      if (!sectData || !itemData) throw new Error('Failed to load template')

      const zones = sectData.filter(s => s.type === 'zone') as TemplateSection[]
      const subs = sectData.filter(s => s.type === 'subsection') as TemplateSection[]
      const items = itemData as TemplateItem[]

      const result: TemplateSectionWithItems[] = zones.map(zone => {
        const zoneSubs = subs.filter(s => s.parent_id === zone.id)
        const subWithItems = zoneSubs.map(sub => ({
          ...sub,
          items: items.filter(it => it.section_id === sub.id),
        }))
        const directItems = items.filter(it => it.section_id === zone.id)
        return { ...zone, subsections: subWithItems, items: directItems }
      })

      setSections(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки шаблона')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const addSection = async (name: string, type: 'zone' | 'subsection', parentId?: string) => {
    const siblings = type === 'zone' ? sections : sections.find(z => z.id === parentId)?.subsections ?? []
    const maxOrder = Math.max(-10, ...siblings.map(s => s.sort_order)) + 10
    const { data, error: err } = await supabase
      .from('template_sections')
      .insert({ name, type, parent_id: parentId || null, sort_order: maxOrder })
      .select()
      .single()
    if (err) throw err
    await load()
    return data
  }

  const updateSection = async (id: string, name: string) => {
    const { error: err } = await supabase
      .from('template_sections')
      .update({ name })
      .eq('id', id)
    if (err) throw err
    await load()
  }

  const deleteSection = async (id: string) => {
    const { error: err } = await supabase
      .from('template_sections')
      .delete()
      .eq('id', id)
    if (err) throw err
    await load()
  }

  const addItem = async (sectionId: string, name: string, responsible: string, isKz: boolean) => {
    const existing = sections.flatMap(z =>
      [...z.items, ...z.subsections.flatMap(s => s.items)]
    )
    const maxNum = Math.max(0, ...existing.map(i => i.number)) + 1
    const inSection = existing.filter(i => i.section_id === sectionId)
    const sortOrder = Math.max(-10, ...inSection.map(i => i.sort_order)) + 10
    const { error: err } = await supabase
      .from('template_items')
      .insert({
        section_id: sectionId,
        number: maxNum,
        name,
        responsible,
        is_kz: isKz,
        sort_order: sortOrder,
      })
    if (err) throw err
    await load()
  }

  const updateItem = async (id: string, updates: Partial<TemplateItem>) => {
    const { error: err } = await supabase
      .from('template_items')
      .update(updates)
      .eq('id', id)
    if (err) throw err
    await load()
  }

  const deleteItem = async (id: string) => {
    const { error: err } = await supabase
      .from('template_items')
      .delete()
      .eq('id', id)
    if (err) throw err
    await load()
  }

  const reorder = async (table: 'template_sections' | 'template_items', list: Array<{ id: string }>, id: string, dir: -1 | 1) => {
    const i = list.findIndex(x => x.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= list.length) return
    const arr = [...list]
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
    const results = await Promise.all(arr.map((x, idx) => supabase.from(table).update({ sort_order: idx * 10 }).eq('id', x.id)))
    const failed = results.find(r => r.error)
    if (failed?.error) throw failed.error
    await load()
  }

  const moveSection = (id: string, dir: -1 | 1) => {
    const zone = sections.find(z => z.id === id)
    if (zone) return reorder('template_sections', sections, id, dir)
    const parent = sections.find(z => z.subsections.some(s => s.id === id))
    return reorder('template_sections', parent?.subsections ?? [], id, dir)
  }

  const moveItem = (sectionId: string, id: string, dir: -1 | 1) => {
    const all = sections.flatMap(z => [{ id: z.id, items: z.items }, ...z.subsections.map(s => ({ id: s.id, items: s.items }))])
    return reorder('template_items', all.find(s => s.id === sectionId)?.items ?? [], id, dir)
  }

  return { sections, loading, error, reload: load, addSection, updateSection, deleteSection, addItem, updateItem, deleteItem, moveSection, moveItem }
}
