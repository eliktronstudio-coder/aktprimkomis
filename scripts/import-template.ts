import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'
import { parseTemplateXlsx, replaceTemplate } from '../src/lib/excelTemplate'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DRY_RUN = process.argv.includes('--dry-run')

async function main() {
  if (!DRY_RUN && (!SUPABASE_URL || !SERVICE_KEY)) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
    process.exit(1)
  }
  const templatePath = path.resolve(process.cwd(), 'template.xlsx')
  if (!fs.existsSync(templatePath)) {
    console.error('template.xlsx not found in project root')
    process.exit(1)
  }

  console.log('Reading template.xlsx...')
  const buf = fs.readFileSync(templatePath)
  const parsed = await parseTemplateXlsx(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
  const zones = parsed.sections.filter(s => s.type === 'zone').length
  const subs = parsed.sections.length - zones
  console.log(`Found ${parsed.sections.length} sections, ${parsed.items.length} items`)
  console.log(`  Zones: ${zones}, subsections: ${subs}, КЗ: ${parsed.items.filter(i => i.is_kz).length}`)
  if (parsed.unknownResponsible.length) {
    console.log(`  Unknown responsible (saved as «Иной КА»): ${parsed.unknownResponsible.join(', ')}`)
  }
  if (DRY_RUN) return

  await replaceTemplate(createClient(SUPABASE_URL!, SERVICE_KEY!), parsed)
  console.log('✓ Template imported successfully!')
}

main().catch(e => { console.error(e); process.exit(1) })
