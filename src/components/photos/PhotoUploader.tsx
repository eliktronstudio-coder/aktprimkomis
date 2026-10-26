import React, { useRef, useState } from 'react'
import { Button, Spinner } from '../ui'
import { usePhotos, photoUrl } from '../../hooks/usePhotos'
import { useAuthStore } from '../../store/authStore'
import type { Photo } from '../../types'

interface PhotoViewerProps {
  photos: Photo[]
  initialIndex: number
  onClose: () => void
}

function PhotoViewer({ photos, initialIndex, onClose }: PhotoViewerProps) {
  const [idx, setIdx] = useState(initialIndex)
  const startX = useRef<number | null>(null)

  const onTouchStart = (e: React.TouchEvent) => { startX.current = e.touches[0].clientX }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (startX.current === null) return
    const dx = e.changedTouches[0].clientX - startX.current
    if (dx > 50 && idx > 0) setIdx(idx - 1)
    if (dx < -50 && idx < photos.length - 1) setIdx(idx + 1)
    startX.current = null
  }

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-white text-sm">{idx + 1} / {photos.length}</span>
        <button onClick={onClose} className="text-white text-2xl p-2">✕</button>
      </div>
      <div className="flex-1 flex items-center justify-center px-2">
        <img src={photoUrl(photos[idx].file_key)} alt="" className="max-h-full max-w-full object-contain" />
      </div>
      {photos.length > 1 && (
        <div className="flex justify-center gap-2 pb-6">
          {photos.map((_, i) => (
            <button key={i} onClick={() => setIdx(i)} className={`w-2 h-2 rounded-full ${i === idx ? 'bg-white' : 'bg-white/40'}`} />
          ))}
        </div>
      )}
    </div>
  )
}

interface PhotoGalleryProps {
  photos: Photo[]
  onDelete?: (photo: Photo) => void
  canDelete?: boolean
}

export function PhotoGallery({ photos, onDelete, canDelete }: PhotoGalleryProps) {
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewerIdx, setViewerIdx] = useState(0)

  if (photos.length === 0) return null

  return (
    <>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {photos.map((p, i) => (
          <div key={p.id} className="relative flex-shrink-0">
            <img
              src={photoUrl(p.thumb_key)}
              alt=""
              className="w-16 h-16 object-cover rounded-lg cursor-pointer border border-gray-200"
              onClick={() => { setViewerIdx(i); setViewerOpen(true) }}
            />
            {canDelete && onDelete && (
              <button
                onClick={e => { e.stopPropagation(); onDelete(p) }}
                className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center"
              >✕</button>
            )}
          </div>
        ))}
      </div>
      {viewerOpen && (
        <PhotoViewer photos={photos} initialIndex={viewerIdx} onClose={() => setViewerOpen(false)} />
      )}
    </>
  )
}

interface PhotoUploaderProps {
  actId: string
  actItemId: string
  type: 'defect' | 'fixed'
  label?: string
}

export function PhotoUploader({ actId, actItemId, type, label }: PhotoUploaderProps) {
  const { user } = useAuthStore()
  const { photos, uploading, uploadProgress, load, upload, deletePhoto } = usePhotos(actId, actItemId)
  const cameraRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  React.useEffect(() => { load() }, [load])

  const filtered = photos.filter(p => p.type === type)

  const handleFile = async (file: File) => {
    if (!user) return
    setError(null)
    setInfo(null)
    try {
      const result = await upload(file, type, user.id)
      if (result === 'queued') setInfo('Нет связи: фото сохранено на телефоне и отправится автоматически')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки')
    }
  }

  return (
    <div className="space-y-2">
      {label && <p className="text-xs font-medium text-gray-600">{label}</p>}

      <PhotoGallery
        photos={filtered}
        onDelete={deletePhoto}
        canDelete={true}
      />

      {info && <p className="text-xs text-amber-600">{info}</p>}

      {uploading && (
        <div className="flex items-center gap-2">
          <Spinner className="h-4 w-4" />
          <div className="flex-1 bg-gray-200 rounded-full h-1.5">
            <div className="bg-blue-600 h-1.5 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
          </div>
          <span className="text-xs text-gray-500">{uploadProgress}%</span>
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex flex-col gap-1">
        <Button variant="outline" size="sm" onClick={() => cameraRef.current?.click()} disabled={uploading}>
          📷 Сфотографировать
        </Button>
        <Button variant="ghost" size="sm" onClick={() => galleryRef.current?.click()} disabled={uploading}>
          🖼 Из галереи
        </Button>
      </div>

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) handleFile(f) }}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={async e => {
          const files = Array.from(e.target.files ?? [])
          e.target.value = ''
          for (const f of files) await handleFile(f)
        }}
      />
    </div>
  )
}
