export type UserRole = 'admin' | 'engineer' | 'contractor'

export interface Profile {
  id: string
  email: string | null
  full_name: string | null
  role: UserRole
  organization: string | null
  created_at: string
}

export interface TemplateSection {
  id: string
  name: string
  type: 'zone' | 'subsection'
  parent_id: string | null
  sort_order: number
  children?: TemplateSection[]
  items?: TemplateItem[]
}

export interface TemplateItem {
  id: string
  section_id: string
  number: number
  name: string
  responsible: string
  is_kz: boolean
  sort_order: number
}

export type ActStatus = 'in_progress' | 'completed'

export interface Act {
  id: string
  branch: string
  store_name: string
  acceptance_date: string | null
  opening_date: string | null
  last_fix_date: string | null
  gen_contractor_name: string | null
  payment_date: string | null
  commissioning_date: string | null
  status: ActStatus
  created_by: string | null
  created_at: string
  updated_at: string
}

export type DefectStatus = 'no_defect' | 'not_fixed' | 'fixed'

export interface ActItem {
  id: string
  act_id: string
  template_item_id: string | null
  section_id: string | null
  zone_name: string | null
  subsection_name: string | null
  number: number
  name: string
  responsible: string
  is_kz: boolean
  sort_order: number
  has_defect: boolean
  defect_status: DefectStatus
  note: string | null
  planned_fix_date: string | null
  actual_fix_date: string | null
  fixed_by: string | null
  fixed_at: string | null
  created_at: string
  updated_at: string
}

export interface Photo {
  id: string
  act_id: string
  act_item_id: string
  type: 'defect' | 'fixed'
  file_key: string
  thumb_key: string
  uploaded_by: string | null
  created_at: string
}

export interface StatusHistoryEntry {
  id: string
  act_item_id: string
  from_status: string | null
  to_status: string
  comment: string | null
  changed_by: string | null
  created_at: string
  profile?: { full_name: string | null; email: string | null }
}

export interface CommissionMember {
  id: string
  act_id: string
  role_type: 'chairman' | 'member'
  position: string
  full_name: string | null
  organization: string | null
  signature_key: string | null
  sort_order: number
  created_at: string
}

export interface ActContractor {
  act_id: string
  user_id: string
  responsible: string
  profile?: Profile
}

export const RESPONSIBLE_OPTIONS = [
  'Ген.подрядчик по СМР',
  'Арендодатель',
  'Интегратор',
  'Подрядчик по РИМ',
  'Иной КА',
] as const

export type Responsible = typeof RESPONSIBLE_OPTIONS[number]

export interface ActWithStats extends Act {
  total_items: number
  defect_items: number
  fixed_items: number
  kz_items: number
  kz_fixed: number
}

export interface SummaryRow {
  responsible: string
  kz_total: number
  kz_not_fixed: number
  kz_fixed: number
  non_kz_total: number
  non_kz_not_fixed: number
  non_kz_fixed: number
}

export interface OfflineQueueItem {
  id: string
  type: 'update_item' | 'upload_photo' | 'delete_photo'
  payload: Record<string, unknown>
  timestamp: number
  retries: number
  lastError?: string
}

export const DEFAULT_COMMISSION_POSITIONS = [
  { role_type: 'chairman' as const, position: 'Председатель комиссии', sort_order: 0 },
  { role_type: 'member' as const, position: 'Представитель ген.подрядной организации по СМР', sort_order: 1 },
  { role_type: 'member' as const, position: 'Представитель подрядной организации по ХО (интегратор)', sort_order: 2 },
  { role_type: 'member' as const, position: 'Представитель подрядной организации по РИМ', sort_order: 3 },
  { role_type: 'member' as const, position: 'Представитель подрядной организации по КТО', sort_order: 4 },
  { role_type: 'member' as const, position: 'Представитель подрядной организации КТО по ХО', sort_order: 5 },
  { role_type: 'member' as const, position: 'Инженер-строитель филиала', sort_order: 6 },
  { role_type: 'member' as const, position: 'Главный инженер филиала', sort_order: 7 },
  { role_type: 'member' as const, position: 'Инженер-энергетик филиала', sort_order: 8 },
  { role_type: 'member' as const, position: 'Инженер по пожарной безопасности', sort_order: 9 },
  { role_type: 'member' as const, position: 'Инженер по технологическому и торговому оборудованию филиала', sort_order: 10 },
  { role_type: 'member' as const, position: 'Инженер по эксплуатации участка филиала', sort_order: 11 },
  { role_type: 'member' as const, position: 'Начальник отдела развития филиала', sort_order: 12 },
  { role_type: 'member' as const, position: 'Директор магазина', sort_order: 13 },
  { role_type: 'member' as const, position: '', sort_order: 14 },
  { role_type: 'member' as const, position: '', sort_order: 15 },
  { role_type: 'member' as const, position: '', sort_order: 16 },
]
