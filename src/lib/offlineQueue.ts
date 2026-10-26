import { openDB, type IDBPDatabase } from 'idb'
import { supabase } from './supabase'
import { requestUploadTarget, uploadToTarget } from './storage'
import type { OfflineQueueItem } from '../types'

const DB_NAME = 'priemka-offline'
const STORE = 'queue'
const CHANGED_EVENT = 'offline-queue-changed'
export const PHOTOS_EVENT = 'photos-changed'

export interface UpdateItemPayload {
  id: string
  updates: Record<string, unknown>
  history?: { from_status: string; to_status: string; changed_by: string; comment?: string | null }
}

export interface PhotoPayload {
  actId: string
  actItemId: string
  type: 'defect' | 'fixed'
  userId: string
  uuid: string
  blob: Blob
  thumbBlob: Blob
}

let dbPromise: Promise<IDBPDatabase> | null = null
function getDB() {
  dbPromise ??= openDB(DB_NAME, 1, {
    upgrade(db) { db.createObjectStore(STORE, { keyPath: 'id' }) },
  })
  return dbPromise
}

const notify = () => window.dispatchEvent(new Event(CHANGED_EVENT))

export function onQueueChanged(cb: () => void): () => void {
  window.addEventListener(CHANGED_EVENT, cb)
  return () => window.removeEventListener(CHANGED_EVENT, cb)
}

export async function getQueue(): Promise<OfflineQueueItem[]> {
  return (await (await getDB()).getAll(STORE)).sort((a, b) => a.timestamp - b.timestamp)
}

export async function enqueue(type: OfflineQueueItem['type'], payload: object): Promise<void> {
  const item: OfflineQueueItem = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    payload: payload as Record<string, unknown>,
    timestamp: Date.now(),
    retries: 0,
  }
  await (await getDB()).put(STORE, item)
  notify()
}

export async function discardQueueItem(id: string): Promise<void> {
  await (await getDB()).delete(STORE, id)
  notify()
}

export function isNetworkError(err: unknown): boolean {
  if (!navigator.onLine) return true
  if (err instanceof TypeError) return true
  const e = err as { message?: string; code?: string } | null
  if (!e || e.code) return false
  return /failed to fetch|network|load failed|timeout|abort/i.test(e.message ?? '')
}

export async function uploadPhotoNow(p: PhotoPayload, onProgress?: (pct: number) => void): Promise<void> {
  const req = { actId: p.actId, actItemId: p.actItemId, type: p.type, uuid: p.uuid }
  const [main, thumb] = await Promise.all([
    requestUploadTarget({ ...req, isThumb: false }),
    requestUploadTarget({ ...req, isThumb: true }),
  ])
  onProgress?.(10)
  await uploadToTarget(main, p.blob, 'image/jpeg')
  onProgress?.(85)
  await uploadToTarget(thumb, p.thumbBlob, 'image/jpeg')
  onProgress?.(95)
  const { error } = await supabase.from('photos').insert({
    act_id: p.actId,
    act_item_id: p.actItemId,
    type: p.type,
    file_key: main.fileKey,
    thumb_key: thumb.fileKey,
    uploaded_by: p.userId,
  })
  if (error) throw error
  window.dispatchEvent(new Event(PHOTOS_EVENT))
}

export async function updateItemNow(p: UpdateItemPayload): Promise<void> {
  const { error } = await supabase.from('act_items').update(p.updates).eq('id', p.id)
  if (error) throw error
  if (p.history) {
    const { error: hErr } = await supabase.from('status_history').insert({ act_item_id: p.id, ...p.history })
    if (hErr) throw hErr
  }
}

let processing = false

// Отправляет очередь по порядку. При обрыве связи останавливается и ничего не теряет;
// отклонённые сервером записи остаются в очереди с текстом ошибки.
export async function processQueue(): Promise<void> {
  if (processing || !navigator.onLine) return
  processing = true
  try {
    const db = await getDB()
    for (const item of await getQueue()) {
      if (item.lastError) continue
      try {
        if (item.type === 'update_item') await updateItemNow(item.payload as unknown as UpdateItemPayload)
        else if (item.type === 'upload_photo') await uploadPhotoNow(item.payload as unknown as PhotoPayload)
        await db.delete(STORE, item.id)
      } catch (err) {
        if (isNetworkError(err)) break
        await db.put(STORE, { ...item, retries: item.retries + 1, lastError: (err as Error).message || 'Ошибка отправки' })
      }
    }
  } finally {
    processing = false
    notify()
  }
}

export async function retryFailed(): Promise<void> {
  const db = await getDB()
  for (const item of await getQueue()) {
    if (item.lastError) await db.put(STORE, { ...item, lastError: undefined })
  }
  notify()
  await processQueue()
}
