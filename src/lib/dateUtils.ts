export function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}.${mm}.${yyyy}`
}

export function parseDate(dmy: string): string {
  // DD.MM.YYYY → YYYY-MM-DD
  const parts = dmy.split('.')
  if (parts.length !== 3) return ''
  return `${parts[2]}-${parts[1]}-${parts[0]}`
}

export function toInputDate(iso: string | null | undefined): string {
  // ISO → YYYY-MM-DD for <input type="date">
  if (!iso) return ''
  return iso.slice(0, 10)
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

export function isOverdue(plannedDate: string | null, status: string): boolean {
  if (!plannedDate || status !== 'not_fixed') return false
  return plannedDate < todayISO()
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return `${formatDate(iso)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
