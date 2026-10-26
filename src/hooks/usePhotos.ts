import { useState, useCallback, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { compressImage } from '../lib/imageUtils'
import { enqueue, isNetworkError, uploadPhotoNow, PHOTOS_EVENT, type PhotoPayload } from '../lib/offlineQueue'
import type { Photo } from '../types'

const R2_PUBLIC_URL = import.meta.env.VITE_R2_PUBLIC_URL as string || ''

export function photoUrl(key: string): string {
  return `${R2_PUBLIC_URL}/${key}`
}

export function usePhotos(actId: string, actItemId: string) {
  const [photos, setPhotos] = useState<Photo[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('photos')
      .select('*')
      .eq('act_item_id', actItemId)
      .order('created_at')
    if (data) setPhotos(data as Photo[])
  }, [actItemId])

  useEffect(() => {
    window.addEventListener(PHOTOS_EVENT, load)
    return () => window.removeEventListener(PHOTOS_EVENT, load)
  }, [load])

  const upload = async (file: File, type: 'defect' | 'fixed', userId: string): Promise<'uploaded' | 'queued'> => {
    setUploading(true)
    setUploadProgress(0)
    try {
      const { blob, thumbBlob, uuid } = await compressImage(file)
      const payload: PhotoPayload = { actId, actItemId, type, userId, uuid, blob, thumbBlob }
      try {
        if (!navigator.onLine) throw new TypeError('offline')
        await uploadPhotoNow(payload, setUploadProgress)
      } catch (err) {
        if (!isNetworkError(err)) throw err
        await enqueue('upload_photo', payload)
        return 'queued'
      }
      setUploadProgress(100)
      return 'uploaded'
    } finally {
      setUploading(false)
    }
  }

  const deletePhoto = async (photo: Photo) => {
    const session = await supabase.auth.getSession()
    const res = await fetch('/api/delete-photo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.data.session?.access_token}`,
      },
      body: JSON.stringify({ photoId: photo.id }),
    })
    if (!res.ok) throw new Error('Delete failed')
    setPhotos(prev => prev.filter(p => p.id !== photo.id))
    window.dispatchEvent(new Event(PHOTOS_EVENT))
  }

  return { photos, uploading, uploadProgress, load, upload, deletePhoto }
}

export function useAllPhotosForAct(actId: string) {
  const [photosByItem, setPhotosByItem] = useState<Record<string, Photo[]>>({})

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('photos')
      .select('*')
      .eq('act_id', actId)
      .order('created_at')
    if (data) {
      const grouped: Record<string, Photo[]> = {}
      for (const p of data as Photo[]) {
        if (!grouped[p.act_item_id]) grouped[p.act_item_id] = []
        grouped[p.act_item_id].push(p)
      }
      setPhotosByItem(grouped)
    }
  }, [actId])

  useEffect(() => {
    window.addEventListener(PHOTOS_EVENT, load)
    return () => window.removeEventListener(PHOTOS_EVENT, load)
  }, [load])

  return { photosByItem, load }
}
