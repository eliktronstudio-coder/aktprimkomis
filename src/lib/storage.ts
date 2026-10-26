import { supabase } from './supabase'

export const PHOTO_BUCKET = 'photos'

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? ''

export function publicUrl(key: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${PHOTO_BUCKET}/${key}`
}

export interface UploadTarget {
  fileKey: string
  token: string
}

export interface UploadRequest {
  actId: string
  actItemId: string
  type: 'defect' | 'fixed' | 'signature'
  isThumb?: boolean
  uuid: string
}

async function authHeaders() {
  const token = (await supabase.auth.getSession()).data.session?.access_token
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}

// Функция Cloudflare проверяет права и выдаёт одноразовый токен загрузки в Supabase Storage
export async function requestUploadTarget(req: UploadRequest): Promise<UploadTarget> {
  const res = await fetch('/api/upload-url', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(req),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw Object.assign(new Error(body.error || 'Не удалось получить разрешение на загрузку'), { code: String(res.status) })
  }
  return res.json() as Promise<UploadTarget>
}

export async function uploadToTarget(target: UploadTarget, blob: Blob, contentType: string): Promise<void> {
  const { error } = await supabase.storage
    .from(PHOTO_BUCKET)
    .uploadToSignedUrl(target.fileKey, target.token, blob, { contentType })
  if (error) throw error
}
