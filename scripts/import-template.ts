import { createClient } from '@supabase/supabase-js'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import * as dotenv from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const DRY_RUN = process.argv.includes('--dry-run')

if (!DRY_RUN && (!SUPABASE_URL || !SERVICE_KEY)) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = DRY_RUN ? (null as never) : createClient(SUPABASE_URL!, SERVICE_KEY!)

interface SectionRow {
  id?: string
  name: string
  type: 'zone' | 'subsection'
  parent_id: string | null
  sort_order: number
}

interface ItemRow {
  section_id: string
  number: number
  name: string
  responsible: string
  is_kz: boolean
  sort_order: number
}

async function main() {
  const templatePath = path.resolve(process.cwd(), 'template.xlsx')
  if (!fs.existsSync(templatePath)) {
    console.error('template.xlsx not found in project root')
    process.exit(1)
  }

  console.log('Reading template.xlsx...')
  const wb = new ExcelJS.Workbook()
  // ExcelJS падает на рисунках/колонтитулах этого файла, а они для импорта не нужны
  const zip = await JSZip.loadAsync(fs.readFileSync(templatePath))
  for (const name of Object.keys(zip.files)) {
    if (name.startsWith('xl/drawings/')) zip.remove(name)
  }
  zip.remove('xl/worksheets/_rels/sheet1.xml.rels')
  const sheetXml = (await zip.file('xl/worksheets/sheet1.xml')!.async('string'))
    .replace(/<(drawing|legacyDrawing|legacyDrawingHF)\b[^>]*\/>/g, '')
  zip.file('xl/worksheets/sheet1.xml', sheetXml)
  await wb.xlsx.load(await zip.generateAsync({ type: 'nodebuffer' }))
  const ws = wb.getWorksheet('TDSheet')
  if (!ws) { console.error('Sheet TDSheet not found'); process.exit(1) }

  const cellText = (v: ExcelJS.CellValue): string => {
    if (v == null) return ''
    if (typeof v === 'object') {
      if ('richText' in v) return v.richText.map(t => t.text).join('')
      if ('result' in v) return String(v.result ?? '')
      if ('text' in v) return String(v.text)
    }
    return String(v)
  }
  const getCellValue = (r: number, c: number): unknown => {
    const cell = ws.getCell(r + 1, c + 1)
    if (cell.isMerged && cell.master.address !== cell.address) return null
    return cellText(cell.value) || null
  }
  const getCellFill = (r: number, c: number): string => {
    const f = ws.getCell(r + 1, c + 1).fill
    if (!f || f.type !== 'pattern') return ''
    return (f.fgColor?.argb || '').slice(-6).toUpperCase()
  }
  const range = { e: { r: ws.rowCount - 1 } }

  const sections: SectionRow[] = []
  const items: ItemRow[] = []
  let curZoneId: string | null = null
  let curSubId: string | null = null
  let sectionOrder = 0

  // Данные начинаются со строки 27 (индекс 26)
  for (let r = 26; r <= range.e.r; r++) {
    const bVal = getCellValue(r, 1)
    const dVal = getCellValue(r, 3)
    const iVal = getCellValue(r, 8)
    const lVal = getCellValue(r, 11)
    const bFill = getCellFill(r, 1)

    if (!bVal && !dVal) continue

    const bStr = bVal != null ? String(bVal).trim() : ''
    const dStr = dVal != null ? String(dVal).trim() : ''

    // Section header (no D value, or D empty)
    if (bStr && !dStr) {
      if (bFill === 'B3B3B3') {
        // Zone
        const id = `zone_${sectionOrder++}`
        sections.push({ id, name: bStr, type: 'zone', parent_id: null, sort_order: (sectionOrder - 1) * 10 })
        curZoneId = id
        curSubId = null
      } else if (bFill === 'DAD7D7') {
        // Subsection
        const id = `sub_${sectionOrder++}`
        sections.push({ id, name: bStr, type: 'subsection', parent_id: curZoneId, sort_order: (sectionOrder - 1) * 10 })
        curSubId = id
      } else {
        // Zone without standard fill (still treat as zone)
        const id = `zone_${sectionOrder++}`
        sections.push({ id, name: bStr, type: 'zone', parent_id: null, sort_order: (sectionOrder - 1) * 10 })
        curZoneId = id
        curSubId = null
      }
    } else if (bStr && dStr) {
      // Check if B is a number
      const num = parseInt(bStr, 10)
      if (!isNaN(num)) {
        const sectionId = curSubId || curZoneId
        if (!sectionId) { console.warn(`Item #${num} has no section, skipping`); continue }
        items.push({
          section_id: sectionId,
          number: num,
          name: dStr,
          responsible: iVal ? String(iVal).trim() : 'Ген.подрядчик по СМР',
          is_kz: lVal ? String(lVal).trim() === 'КЗ' : false,
          sort_order: num * 10,
        })
      }
    }
  }

  console.log(`Found ${sections.length} sections, ${items.length} items`)
  if (DRY_RUN) {
    console.log(`  Zones: ${sections.filter(s => s.type === 'zone').length}, subsections: ${sections.filter(s => s.type === 'subsection').length}, КЗ: ${items.filter(i => i.is_kz).length}`)
    return
  }

  // Check existing data
  const { count } = await supabase.from('template_sections').select('*', { count: 'exact', head: true })
  if ((count || 0) > 0) {
    console.log(`Template already has ${count} sections. Clearing...`)
    await supabase.from('template_items').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('template_sections').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  }

  // Insert sections in two passes (zones first, then subs)
  const sectionIdMap: Record<string, string> = {}

  const zones = sections.filter(s => s.type === 'zone')
  console.log(`Inserting ${zones.length} zones...`)
  for (const zone of zones) {
    const tmpId = zone.id!
    const { data, error } = await supabase
      .from('template_sections')
      .insert({ name: zone.name, type: zone.type, parent_id: null, sort_order: zone.sort_order })
      .select()
      .single()
    if (error) { console.error('Zone insert error:', error); process.exit(1) }
    sectionIdMap[tmpId] = data.id
  }

  const subs = sections.filter(s => s.type === 'subsection')
  console.log(`Inserting ${subs.length} subsections...`)
  for (const sub of subs) {
    const tmpId = sub.id!
    const parentDbId = sub.parent_id ? sectionIdMap[sub.parent_id] : null
    const { data, error } = await supabase
      .from('template_sections')
      .insert({ name: sub.name, type: sub.type, parent_id: parentDbId, sort_order: sub.sort_order })
      .select()
      .single()
    if (error) { console.error('Sub insert error:', error); process.exit(1) }
    sectionIdMap[tmpId] = data.id
  }

  console.log(`Inserting ${items.length} items...`)
  const batchSize = 50
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize).map(it => ({
      ...it,
      section_id: sectionIdMap[it.section_id] || it.section_id,
    }))
    const { error } = await supabase.from('template_items').insert(batch)
    if (error) { console.error('Items insert error:', error); process.exit(1) }
    console.log(`  Inserted ${Math.min(i + batchSize, items.length)}/${items.length}`)
  }

  console.log('✓ Template imported successfully!')
  console.log(`  Zones: ${zones.length}`)
  console.log(`  Subsections: ${subs.length}`)
  console.log(`  Items: ${items.length}`)
}

main().catch(e => { console.error(e); process.exit(1) })
