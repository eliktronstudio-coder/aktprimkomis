import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import type { SupabaseClient } from '@supabase/supabase-js'
import { RESPONSIBLE_OPTIONS } from '../types'

export interface ParsedSection {
  key: string
  name: string
  type: 'zone' | 'subsection'
  parentKey: string | null
  sort_order: number
}

export interface ParsedItem {
  sectionKey: string
  number: number
  name: string
  responsible: string
  is_kz: boolean
  sort_order: number
}

export interface ParsedTemplate {
  sections: ParsedSection[]
  items: ParsedItem[]
  unknownResponsible: string[]
}

const FIRST_DATA_ROW = 27
const DEFAULT_RESPONSIBLE = 'Ген.подрядчик по СМР'
const FALLBACK_RESPONSIBLE = 'Иной КА'

const norm = (s: string) => s.toLowerCase().replace(/[\s.]+/g, '')
const RESPONSIBLE_BY_NORM = new Map<string, string>(RESPONSIBLE_OPTIONS.map(r => [norm(r), r]))

// ExcelJS падает на рисунках и колонтитулах, а для разбора они не нужны
async function stripDrawings(data: ArrayBuffer): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(data)
  for (const name of Object.keys(zip.files)) {
    if (name.startsWith('xl/drawings/')) zip.remove(name)
  }
  for (const name of Object.keys(zip.files)) {
    const file = zip.file(name)
    if (!file) continue
    if (/^xl\/worksheets\/_rels\/.+\.rels$/.test(name)) {
      const xml = (await file.async('string'))
        .replace(/<Relationship\b[^>]*Target="[^"]*(?:drawing|vmlDrawing)[^"]*"[^>]*\/>/gi, '')
      zip.file(name, xml)
    } else if (/^xl\/worksheets\/[^/]+\.xml$/.test(name)) {
      const xml = (await file.async('string')).replace(/<(drawing|legacyDrawing|legacyDrawingHF)\b[^>]*\/>/g, '')
      zip.file(name, xml)
    }
  }
  return zip.generateAsync({ type: 'arraybuffer' })
}

const cellText = (v: ExcelJS.CellValue): string => {
  if (v == null) return ''
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map(t => t.text).join('')
    if ('result' in v) return String(v.result ?? '')
    if ('text' in v) return String(v.text)
  }
  return String(v)
}

export async function parseTemplateXlsx(data: ArrayBuffer): Promise<ParsedTemplate> {
  const wb = new ExcelJS.Workbook()
  try {
    await wb.xlsx.load(await stripDrawings(data))
  } catch {
    throw new Error('Не удалось прочитать файл. Нужен Excel в формате .xlsx')
  }
  const ws = wb.getWorksheet('TDSheet') ?? wb.worksheets[0]
  if (!ws) throw new Error('В файле нет листов')

  const text = (r: number, c: number): string => {
    const cell = ws.getCell(r, c)
    if (cell.isMerged && cell.master.address !== cell.address) return ''
    return cellText(cell.value).trim()
  }
  const fill = (r: number, c: number): string => {
    const f = ws.getCell(r, c).fill
    if (!f || f.type !== 'pattern') return ''
    return (f.fgColor?.argb || '').slice(-6).toUpperCase()
  }

  const sections: ParsedSection[] = []
  const items: ParsedItem[] = []
  const unknown = new Set<string>()
  let zoneKey: string | null = null
  let subKey: string | null = null

  // Колонки бланка: B — номер или название раздела, D — работы, I — ответственный, L — «КЗ»
  for (let r = FIRST_DATA_ROW; r <= ws.rowCount; r++) {
    const b = text(r, 2)
    const d = text(r, 4)
    if (!b) continue

    if (!d) {
      const key = `s${sections.length}`
      const isSub = fill(r, 2) === 'DAD7D7' && zoneKey !== null
      sections.push({ key, name: b, type: isSub ? 'subsection' : 'zone', parentKey: isSub ? zoneKey : null, sort_order: sections.length * 10 })
      if (isSub) subKey = key
      else { zoneKey = key; subKey = null }
      continue
    }

    const num = parseInt(b, 10)
    const sectionKey = subKey || zoneKey
    if (isNaN(num) || !sectionKey) continue

    const rawResp = text(r, 9)
    let responsible = rawResp ? RESPONSIBLE_BY_NORM.get(norm(rawResp)) : DEFAULT_RESPONSIBLE
    if (!responsible) { unknown.add(rawResp); responsible = FALLBACK_RESPONSIBLE }

    items.push({
      sectionKey,
      number: num,
      name: d,
      responsible,
      is_kz: text(r, 12) === 'КЗ',
      sort_order: num * 10,
    })
  }

  if (items.length === 0) {
    throw new Error('В файле не найдено ни одного пункта. Проверьте, что это бланк акта в том же формате: пункты с 27-й строки, номер в колонке B, работы в колонке D')
  }
  return { sections, items, unknownResponsible: [...unknown] }
}

export function summarize(t: ParsedTemplate): string {
  const zones = t.sections.filter(s => s.type === 'zone').length
  const kz = t.items.filter(i => i.is_kz).length
  return `${t.items.length} пунктов в ${zones} зонах, из них КЗ: ${kz}`
}

export function actItemsFromParsed(t: ParsedTemplate) {
  const byKey = new Map(t.sections.map(s => [s.key, s]))
  return t.items.map((it, idx) => {
    const sec = byKey.get(it.sectionKey)!
    const zone = sec.type === 'subsection' ? byKey.get(sec.parentKey!) : sec
    return {
      zone_name: zone?.name ?? null,
      subsection_name: sec.type === 'subsection' ? sec.name : null,
      number: idx + 1,
      name: it.name,
      responsible: it.responsible,
      is_kz: it.is_kz,
      sort_order: idx,
    }
  })
}

export async function replaceTemplate(db: SupabaseClient, t: ParsedTemplate): Promise<void> {
  const ids = new Map(t.sections.map(s => [s.key, crypto.randomUUID()]))
  const row = (s: ParsedSection) => ({
    id: ids.get(s.key), name: s.name, type: s.type, parent_id: s.parentKey ? ids.get(s.parentKey) : null, sort_order: s.sort_order,
  })

  const check = ({ error }: { error: { message: string } | null }) => { if (error) throw new Error(error.message) }
  check(await db.from('template_items').delete().not('id', 'is', null))
  check(await db.from('template_sections').delete().not('id', 'is', null))
  check(await db.from('template_sections').insert(t.sections.filter(s => s.type === 'zone').map(row)))
  const subs = t.sections.filter(s => s.type === 'subsection')
  if (subs.length) check(await db.from('template_sections').insert(subs.map(row)))
  for (let i = 0; i < t.items.length; i += 100) {
    check(await db.from('template_items').insert(t.items.slice(i, i + 100).map(it => ({
      section_id: ids.get(it.sectionKey), number: it.number, name: it.name,
      responsible: it.responsible, is_kz: it.is_kz, sort_order: it.sort_order,
    }))))
  }
}
