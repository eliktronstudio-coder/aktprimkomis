import React, { useState } from 'react'
import { Button } from '../ui'
import type { Act, ActItem, CommissionMember, SummaryRow, Photo } from '../../types'
import { formatDate } from '../../lib/dateUtils'
import { photoUrl } from '../../hooks/usePhotos'

interface ExcelExportProps {
  act: Act
  items: ActItem[]
  commission: CommissionMember[]
  summaryRows: SummaryRow[]
  photosByItem: Record<string, Photo[]>
}

const ZONE_FILL = 'FFB3B3B3'
const SUB_FILL = 'FFDAD7D7'
const LAST_COL = 12 // L

const STATUS_LABELS: Record<string, string> = {
  no_defect: 'Нет замечаний',
  not_fixed: 'Замечание не устранено',
  fixed: 'Замечание устранено',
}

const thin = { style: 'thin' as const, color: { argb: 'FF999999' } }
const borderAll = { top: thin, left: thin, bottom: thin, right: thin }

async function fetchBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const buf = new Uint8Array(await res.arrayBuffer())
    let bin = ''
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
    return btoa(bin)
  } catch {
    return null
  }
}

const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '_').trim()

export function ExcelExport({ act, items, commission, summaryRows, photosByItem }: ExcelExportProps) {
  const [loading, setLoading] = useState(false)

  const exportExcel = async () => {
    setLoading(true)
    try {
      const ExcelJS = (await import('exceljs')).default
      const wb = new ExcelJS.Workbook()
      const ws = wb.addWorksheet('Акт', { views: [{ showGridLines: false }] })
      ws.columns = [
        { width: 2 }, { width: 7 }, { width: 58 }, { width: 14 }, { width: 16 }, { width: 24 },
        { width: 6 }, { width: 44 }, { width: 24 }, { width: 16 }, { width: 38 }, { width: 38 },
      ]

      // Шапка
      ws.mergeCells(2, 2, 2, LAST_COL)
      const title = ws.getCell(2, 2)
      title.value = 'АКТ приёмки законченного строительством (ремонтом, реконструкцией) объекта'
      title.font = { bold: true, size: 14 }
      title.alignment = { horizontal: 'center' }

      const headerRows: Array<[string, string]> = [
        ['Филиал', act.branch],
        ['Название магазина', act.store_name],
        ['Дата приёмки', formatDate(act.acceptance_date)],
        ['Дата открытия', formatDate(act.opening_date)],
        ['Дата устранения последнего замечания', formatDate(act.last_fix_date)],
      ]
      headerRows.forEach(([label, value], i) => {
        const r = 4 + i
        ws.mergeCells(r, 2, r, 3)
        ws.getCell(r, 2).value = label
        ws.getCell(r, 2).font = { bold: true }
        ws.mergeCells(r, 4, r, 6)
        ws.getCell(r, 4).value = value
        ws.getCell(r, 4).border = { bottom: thin }
      })

      // Сводка: две таблицы, 5 ответственных + ИТОГО
      let row = 10
      const summaryTable = (caption: string, pick: (r: SummaryRow) => [number, number, number]) => {
        ws.mergeCells(row, 2, row, 3)
        ws.getCell(row, 2).value = caption
        ws.getCell(row, 2).font = { bold: true }
        ;['Всего', 'Не устранено', 'Устранено'].forEach((h, i) => {
          const c = ws.getCell(row, 4 + i)
          c.value = h
          c.font = { bold: true }
          c.alignment = { horizontal: 'center', wrapText: true }
          c.border = borderAll
        })
        row++
        const totals = [0, 0, 0]
        for (const r of summaryRows) {
          const v = pick(r)
          ws.mergeCells(row, 2, row, 3)
          ws.getCell(row, 2).value = r.responsible
          v.forEach((n, i) => {
            totals[i] += n
            const c = ws.getCell(row, 4 + i)
            c.value = n
            c.alignment = { horizontal: 'center' }
            c.border = borderAll
          })
          row++
        }
        ws.mergeCells(row, 2, row, 3)
        ws.getCell(row, 2).value = 'ИТОГО:'
        ws.getCell(row, 2).font = { bold: true }
        totals.forEach((n, i) => {
          const c = ws.getCell(row, 4 + i)
          c.value = n
          c.font = { bold: true }
          c.alignment = { horizontal: 'center' }
          c.border = borderAll
        })
        row += 2
      }
      summaryTable('Количество критичных замечаний', r => [r.kz_total, r.kz_not_fixed, r.kz_fixed])
      summaryTable('Количество не критичных замечаний', r => [r.non_kz_total, r.non_kz_not_fixed, r.non_kz_fixed])

      // Таблица пунктов
      const headers = ['№ п/п', 'Наименование работ', 'Есть замечания', 'Дата устранения (план)', 'Ответственный', 'КЗ', 'Примечание', 'Статус', 'Фактическая дата устранения', 'Фото замечания', 'Фото устранения']
      headers.forEach((h, i) => {
        const c = ws.getCell(row, 2 + i)
        c.value = h
        c.font = { bold: true }
        c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
        c.border = borderAll
      })
      ws.getRow(row).height = 32
      ws.views = [{ showGridLines: false, state: 'frozen', ySplit: row }]
      row++

      const sectionRow = (text: string, fill: string) => {
        ws.mergeCells(row, 2, row, LAST_COL)
        const c = ws.getCell(row, 2)
        c.value = text
        c.font = { bold: true }
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }
        for (let col = 2; col <= LAST_COL; col++) ws.getCell(row, col).border = borderAll
        row++
      }

      let lastZone: string | null | undefined
      let lastSub: string | null | undefined
      for (const item of items) {
        if (item.zone_name !== lastZone) {
          lastZone = item.zone_name
          lastSub = undefined
          if (item.zone_name) sectionRow(item.zone_name, ZONE_FILL)
        }
        if (item.subsection_name !== lastSub) {
          lastSub = item.subsection_name
          if (item.subsection_name) sectionRow(item.subsection_name, SUB_FILL)
        }

        const photos = photosByItem[item.id] || []
        const defectUrls = photos.filter(p => p.type === 'defect').map(p => photoUrl(p.file_key))
        const fixedUrls = photos.filter(p => p.type === 'fixed').map(p => photoUrl(p.file_key))

        const values: Array<string | number> = [
          item.number,
          item.name,
          item.has_defect ? 'Да' : 'Нет',
          formatDate(item.planned_fix_date),
          item.responsible,
          item.is_kz ? 'КЗ' : '',
          item.note || '',
          STATUS_LABELS[item.defect_status] ?? item.defect_status,
          formatDate(item.actual_fix_date),
        ]
        values.forEach((v, i) => { ws.getCell(row, 2 + i).value = v })
        const setLinks = (col: number, urls: string[]) => {
          if (urls.length) ws.getCell(row, col).value = { text: urls.join('\n'), hyperlink: urls[0] }
        }
        setLinks(11, defectUrls)
        setLinks(12, fixedUrls)

        for (let col = 2; col <= LAST_COL; col++) {
          const c = ws.getCell(row, col)
          c.border = borderAll
          c.alignment = { vertical: 'top', wrapText: true, horizontal: [2, 4, 5, 7, 10].includes(col) ? 'center' : 'left' }
          if (col === 11 || col === 12) c.font = { color: { argb: 'FF0563C1' }, underline: true, size: 9 }
        }
        if (item.is_kz) ws.getCell(row, 7).font = { bold: true, color: { argb: 'FFCC0000' } }
        const fill = item.defect_status === 'not_fixed' ? 'FFFDE2E2' : item.defect_status === 'fixed' ? 'FFE0F4E3' : null
        if (fill) for (let col = 2; col <= LAST_COL; col++) ws.getCell(row, col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }
        row++
      }

      // Подписи комиссии
      row += 1
      const signatures = new Map<string, number>()
      const sigBase64 = new Map<string, string | null>()
      await Promise.all(commission.filter(m => m.signature_key).map(async m => {
        sigBase64.set(m.id, await fetchBase64(photoUrl(m.signature_key!)))
      }))

      const personRow = (m: CommissionMember, label: string) => {
        ws.mergeCells(row, 2, row, 3)
        ws.getCell(row, 2).value = label
        ws.getCell(row, 2).font = { bold: true }
        ws.mergeCells(row, 4, row, 6)
        ws.getCell(row, 4).value = [m.full_name, m.organization].filter(Boolean).join(', ')
        ws.getCell(row, 4).border = { bottom: thin }
        ws.getCell(row, 8).value = m.signature_key ? '' : '(подпись)'
        ws.getCell(row, 8).font = { color: { argb: 'FF999999' }, size: 9 }
        ws.getRow(row).height = 36
        const b64 = sigBase64.get(m.id)
        if (b64) {
          const imageId = wb.addImage({ base64: b64, extension: 'png' })
          ws.addImage(imageId, { tl: { col: 6.2, row: row - 0.95 }, ext: { width: 110, height: 40 } })
        } else if (m.signature_key) {
          ws.getCell(row, 8).value = { text: 'подпись (ссылка)', hyperlink: photoUrl(m.signature_key) }
        }
        signatures.set(m.id, row)
        row++
      }

      const chairman = commission.find(m => m.role_type === 'chairman')
      if (chairman) personRow(chairman, 'Председатель комиссии')
      row++
      ws.getCell(row, 2).value = 'Члены комиссии:'
      ws.getCell(row, 2).font = { bold: true }
      row++
      for (const m of commission.filter(x => x.role_type === 'member')) {
        if (!m.position && !m.full_name) continue
        personRow(m, m.position || 'Член комиссии')
      }

      // Итоговые заключения
      const engineer = commission.find(m => m.position.startsWith('Инженер-строитель'))
      const chief = commission.find(m => m.position.startsWith('Главный инженер'))
      const allFixed = items.filter(i => i.has_defect).every(i => i.defect_status === 'fixed')

      const conclusion = (text: string) => {
        row += 1
        ws.mergeCells(row, 2, row, LAST_COL)
        const c = ws.getCell(row, 2)
        c.value = text
        c.alignment = { wrapText: true, vertical: 'top' }
        ws.getRow(row).height = 34
        row += 2
        ws.getCell(row, 3).value = `Инженер-строитель: ${engineer?.full_name || '______________'}`
        ws.getCell(row, 8).value = `Главный инженер: ${chief?.full_name || '______________'}`
        row++
        ws.getCell(row, 3).value = '(ФИО, подпись)'
        ws.getCell(row, 8).value = '(ФИО, подпись)'
        ws.getCell(row, 3).font = ws.getCell(row, 8).font = { color: { argb: 'FF999999' }, size: 9 }
        row++
      }
      conclusion(`1. Замечания к генеральному подрядчику по СМР «${act.gen_contractor_name || '____________'}» отсутствуют. Согласована оплата выполненных работ по договору ген. подряда «${act.payment_date ? formatDate(act.payment_date) : '__.__.____'}».`)
      if (allFixed) {
        conclusion(`2. Работы выполнены. Замечания устранены в полном объёме. Исполнительная документация сдана (согласно Приложения №2). Объект принят в эксплуатацию «${formatDate(act.commissioning_date || act.last_fix_date)}».`)
      }

      ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }

      const buffer = await wb.xlsx.writeBuffer()
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Акт_${safeName(act.store_name)}_${formatDate(act.acceptance_date)}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10000)
    } catch (e) {
      alert('Ошибка экспорта Excel')
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={exportExcel} loading={loading}>
      📊 Экспорт Excel
    </Button>
  )
}
