import React, { useRef, useEffect, useState } from 'react'
import { Button } from '../ui'
import { requestUploadTarget, uploadToTarget, publicUrl } from '../../lib/storage'

interface SignatureCanvasProps {
  actId: string
  memberId: string
  existingKey?: string | null
  onSaved: (key: string) => void
}

export function SignatureCanvas({ actId, memberId, existingKey, onSaved }: SignatureCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [hasContent, setHasContent] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showCanvas, setShowCanvas] = useState(false)

  const getPos = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    if ('touches' in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      }
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    }
  }

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    const canvas = canvasRef.current
    if (!canvas) return
    drawing.current = true
    const ctx = canvas.getContext('2d')!
    const pos = getPos(e, canvas)
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
  }

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    if (!drawing.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const pos = getPos(e, canvas)
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#1e293b'
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    setHasContent(true)
  }

  const stopDraw = () => { drawing.current = false }

  const clear = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height)
    setHasContent(false)
  }

  const save = async () => {
    const canvas = canvasRef.current
    if (!canvas || !hasContent) return
    setSaving(true)
    try {
      const blob = await new Promise<Blob>((res, rej) =>
        canvas.toBlob(b => b ? res(b) : rej(new Error('Canvas failed')), 'image/png')
      )
      const target = await requestUploadTarget({ actId, actItemId: memberId, type: 'signature', uuid: crypto.randomUUID() })
      await uploadToTarget(target, blob, 'image/png')
      const fileKey = target.fileKey

      onSaved(fileKey)
      setShowCanvas(false)
    } catch (e) {
      alert('Ошибка сохранения подписи')
    } finally {
      setSaving(false)
    }
  }

  if (!showCanvas) {
    return (
      <div className="flex items-center gap-3">
        {existingKey ? (
          <>
            <img src={publicUrl(existingKey)} alt="Подпись" className="h-12 border rounded bg-white" />
            <Button variant="ghost" size="sm" onClick={() => setShowCanvas(true)}>Переподписать</Button>
          </>
        ) : (
          <Button variant="outline" size="sm" onClick={() => setShowCanvas(true)}>✍ Поставить подпись</Button>
        )}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-3">
      <div className="bg-white rounded-xl p-4 w-full max-w-md space-y-3">
        <p className="text-sm font-medium text-gray-800">Распишитесь пальцем в поле ниже</p>
        <canvas
          ref={canvasRef}
          width={600}
          height={240}
          className="border-2 border-dashed border-gray-300 rounded-lg w-full bg-white touch-none cursor-crosshair"
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={stopDraw}
          onMouseLeave={stopDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={stopDraw}
        />
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={clear}>Очистить</Button>
          <Button variant="ghost" size="sm" onClick={() => setShowCanvas(false)}>Отмена</Button>
          <Button variant="primary" size="sm" onClick={save} disabled={!hasContent} loading={saving}>Сохранить</Button>
        </div>
      </div>
    </div>
  )
}
