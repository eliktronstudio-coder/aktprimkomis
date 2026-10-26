import React, { useState } from 'react'
import { Button, Select } from '../ui'
import type { Act, ActItem, Photo } from '../../types'
import { RESPONSIBLE_OPTIONS } from '../../types'
import { formatDate, isOverdue } from '../../lib/dateUtils'
import { photoUrl } from '../../hooks/usePhotos'

interface PdfExportProps {
  act: Act
  items: ActItem[]
  photosByItem: Record<string, Photo[]>
}

const PAGE_W = 210
const PAGE_H = 297
const MARGIN = 14
const CONTENT_W = PAGE_W - MARGIN * 2
const COL_W = (CONTENT_W - 6) / 2
const THUMB_W = 40
const THUMB_H = 30
const MAX_PHOTOS_PER_SIDE = 6

const STATUS_LABELS: Record<string, string> = {
  not_fixed: 'Замечание не устранено',
  fixed: 'Замечание устранено',
  no_defect: 'Нет замечаний',
}

async function fetchBuffer(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: ${res.status}`)
  return res.arrayBuffer()
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

interface LoadedImage { dataUrl: string; w: number; h: number }

async function loadImage(url: string): Promise<LoadedImage | null> {
  try {
    const buf = await fetchBuffer(url)
    const dataUrl = `data:image/jpeg;base64,${toBase64(buf)}`
    const size = await new Promise<{ w: number; h: number }>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
      img.onerror = reject
      img.src = dataUrl
    })
    return { dataUrl, ...size }
  } catch {
    return null
  }
}

export function PdfExport({ act, items, photosByItem }: PdfExportProps) {
  const [loading, setLoading] = useState(false)
  const [filterResp, setFilterResp] = useState('all')

  const exportPdf = async () => {
    setLoading(true)
    try {
      const jsPDF = (await import('jspdf')).default
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

      // Встроенные шрифты jsPDF не содержат кириллицу, поэтому подключаем свои
      const [regular, bold] = await Promise.all([
        fetchBuffer(`${import.meta.env.BASE_URL}fonts/LiberationSans-Regular.ttf`),
        fetchBuffer(`${import.meta.env.BASE_URL}fonts/LiberationSans-Bold.ttf`),
      ])
      doc.addFileToVFS('LiberationSans-Regular.ttf', toBase64(regular))
      doc.addFileToVFS('LiberationSans-Bold.ttf', toBase64(bold))
      doc.addFont('LiberationSans-Regular.ttf', 'LS', 'normal')
      doc.addFont('LiberationSans-Bold.ttf', 'LS', 'bold')

      let y = MARGIN
      const ensure = (h: number) => {
        if (y + h > PAGE_H - MARGIN) { doc.addPage(); y = MARGIN }
      }
      const text = (str: string, size: number, style: 'normal' | 'bold', color: [number, number, number] = [30, 30, 30]) => {
        doc.setFont('LS', style)
        doc.setFontSize(size)
        doc.setTextColor(...color)
        const lines = doc.splitTextToSize(str, CONTENT_W) as string[]
        const lineH = size * 0.42
        for (const line of lines) {
          ensure(lineH + 1)
          doc.text(line, MARGIN, y + lineH)
          y += lineH + 0.8
        }
      }

      text('Отчёт по замечаниям', 15, 'bold')
      y += 1
      text(`Магазин: ${act.store_name}, ${act.branch}`, 10, 'normal')
      text(`Дата приёмки: ${formatDate(act.acceptance_date)}    Дата открытия: ${formatDate(act.opening_date)}`, 10, 'normal')
      text(`Дата формирования: ${formatDate(new Date().toISOString().slice(0, 10))}`, 10, 'normal')
      if (filterResp !== 'all') text(`Ответственный: ${filterResp}`, 10, 'bold')
      y += 3

      const defectItems = items.filter(i => i.has_defect && (filterResp === 'all' || i.responsible === filterResp))
      if (defectItems.length === 0) text('Замечаний нет.', 11, 'normal')

      const grouped = new Map<string, ActItem[]>()
      for (const item of defectItems) {
        if (!grouped.has(item.responsible)) grouped.set(item.responsible, [])
        grouped.get(item.responsible)!.push(item)
      }

      for (const [resp, respItems] of grouped) {
        ensure(14)
        doc.setFillColor(225, 230, 245)
        doc.rect(MARGIN, y, CONTENT_W, 7, 'F')
        doc.setFont('LS', 'bold'); doc.setFontSize(11); doc.setTextColor(30, 30, 30)
        doc.text(`${resp} — замечаний: ${respItems.length}`, MARGIN + 2, y + 5)
        y += 10

        for (const item of respItems) {
          const photos = photosByItem[item.id] || []
          const defect = photos.filter(p => p.type === 'defect')
          const fixed = photos.filter(p => p.type === 'fixed')
          const [defImgs, fixImgs] = await Promise.all([
            Promise.all(defect.slice(0, MAX_PHOTOS_PER_SIDE).map(p => loadImage(photoUrl(p.thumb_key || p.file_key)))),
            Promise.all(fixed.slice(0, MAX_PHOTOS_PER_SIDE).map(p => loadImage(photoUrl(p.thumb_key || p.file_key)))),
          ])

          ensure(30)
          text(`${item.number}. ${item.is_kz ? '[КЗ] ' : ''}${item.name}`, 10, 'bold')
          const overdue = isOverdue(item.planned_fix_date, item.defect_status)
          text(
            `Статус: ${STATUS_LABELS[item.defect_status] ?? item.defect_status}${overdue ? ' (ПРОСРОЧЕНО)' : ''}   ` +
            `План: ${formatDate(item.planned_fix_date) || '—'}   Факт: ${formatDate(item.actual_fix_date) || '—'}`,
            9, 'normal', item.defect_status === 'fixed' ? [20, 120, 50] : [180, 30, 30],
          )
          if (item.note) text(`Примечание: ${item.note}`, 9, 'normal')

          // Фото «до» и «после» рядом
          const rows = Math.max(Math.ceil(defImgs.length / 2), Math.ceil(fixImgs.length / 2), 1)
          ensure(5 + THUMB_H)
          doc.setFont('LS', 'bold'); doc.setFontSize(8); doc.setTextColor(90, 90, 90)
          doc.text(`До (${defect.length})`, MARGIN, y + 3)
          doc.text(`После (${fixed.length})`, MARGIN + COL_W + 6, y + 3)
          y += 4.5

          for (let r = 0; r < rows; r++) {
            ensure(THUMB_H + 2)
            const place = (imgs: (LoadedImage | null)[], colX: number, total: number) => {
              for (let k = 0; k < 2; k++) {
                const idx = r * 2 + k
                if (idx >= total) break
                const x = colX + k * (THUMB_W + 4)
                const img = imgs[idx]
                if (!img) {
                  doc.setFont('LS', 'normal'); doc.setFontSize(7); doc.setTextColor(150, 150, 150)
                  doc.text('фото недоступно', x, y + THUMB_H / 2)
                  continue
                }
                const ratio = Math.min(THUMB_W / img.w, THUMB_H / img.h)
                doc.addImage(img.dataUrl, 'JPEG', x, y, img.w * ratio, img.h * ratio)
              }
            }
            place(defImgs, MARGIN, defImgs.length)
            place(fixImgs, MARGIN + COL_W + 6, fixImgs.length)
            y += THUMB_H + 2
          }
          if (defect.length > MAX_PHOTOS_PER_SIDE || fixed.length > MAX_PHOTOS_PER_SIDE) {
            text(`Показаны первые ${MAX_PHOTOS_PER_SIDE} фото с каждой стороны`, 7, 'normal', [130, 130, 130])
          }
          if (defect.length === 0 && fixed.length === 0) y -= THUMB_H + 2 - 4

          doc.setDrawColor(210, 210, 210)
          doc.line(MARGIN, y + 1, PAGE_W - MARGIN, y + 1)
          y += 5
        }
        y += 2
      }

      const pages = doc.getNumberOfPages()
      for (let i = 1; i <= pages; i++) {
        doc.setPage(i)
        doc.setFont('LS', 'normal'); doc.setFontSize(8); doc.setTextColor(140, 140, 140)
        doc.text(`${i} / ${pages}`, PAGE_W - MARGIN, PAGE_H - 7, { align: 'right' })
      }

      const suffix = filterResp !== 'all' ? `_${filterResp}` : ''
      doc.save(`Замечания_${act.store_name}${suffix}_${formatDate(act.acceptance_date)}.pdf`.replace(/[\\/:*?"<>|]+/g, '_'))
    } catch (e) {
      alert('Ошибка экспорта PDF')
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex gap-2 items-end">
      <Select
        label=""
        value={filterResp}
        onChange={e => setFilterResp(e.target.value)}
        options={[
          { value: 'all', label: 'Все ответственные' },
          ...RESPONSIBLE_OPTIONS.map(r => ({ value: r, label: r })),
        ]}
        className="text-sm max-w-[200px]"
      />
      <Button variant="outline" size="sm" onClick={exportPdf} loading={loading}>
        📄 PDF отчёт
      </Button>
    </div>
  )
}
