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

export async function callFunction(name: 'upload-url' | 'delete-photo', body: unknown): Promise<Response> {
  const token = (await supabase.auth.getSession()).data.session?.access_token
  return fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
}

// Функция Supabase проверяет права и выдаёт одноразовый токен загрузки в Supabase Storage
export async function requestUploadTarget(req: UploadRequest): Promise<UploadTarget> {
  const res = await callFunction('upload-url', req)
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
