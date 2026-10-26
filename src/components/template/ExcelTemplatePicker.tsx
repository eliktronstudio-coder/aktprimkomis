import React, { useRef, useState } from 'react'
import type { ParsedTemplate } from '../../lib/excelTemplate'
import { Alert, Button } from '../ui'

interface Props {
  value: ParsedTemplate | null
  onChange: (t: ParsedTemplate | null) => void
  buttonLabel?: string
}

export function ExcelTemplatePicker({ value, onChange, buttonLabel = 'Выбрать Excel-файл' }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState('')

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setFileName(file.name)
    setError(null)
    setParsing(true)
    onChange(null)
    try {
      const lib = await import('../../lib/excelTemplate')
      const parsed = await lib.parseTemplateXlsx(await file.arrayBuffer())
      setSummary(lib.summarize(parsed))
      onChange(parsed)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось прочитать файл')
    } finally {
      setParsing(false)
    }
  }

  const clear = () => { onChange(null); setFileName(''); setError(null) }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={handleFile}
      />
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" loading={parsing} onClick={() => inputRef.current?.click()}>
          📄 {buttonLabel}
        </Button>
        {value && <button type="button" onClick={clear} className="text-xs text-gray-500 underline">убрать</button>}
      </div>
      {fileName && parsing && <p className="text-xs text-gray-500">Читаю {fileName}…</p>}
      {error && <Alert type="error">{fileName}: {error}</Alert>}
      {value && (
        <Alert type="success">
          {fileName}: {summary}
          {value.unknownResponsible.length > 0 && (
            <span className="block mt-1 text-amber-700">
              Неизвестные ответственные записаны как «Иной КА»: {value.unknownResponsible.join(', ')}
            </span>
          )}
        </Alert>
      )}
    </div>
  )
}
