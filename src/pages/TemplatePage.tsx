import React, { useState } from 'react'
import { PageLayout } from '../components/layout/PageLayout'
import { useTemplate } from '../hooks/useTemplate'
import { Button, Input, Select, Badge, Spinner, Card, Alert, Modal } from '../components/ui'
import { RESPONSIBLE_OPTIONS } from '../types'
import { supabase } from '../lib/supabase'
import { ExcelTemplatePicker } from '../components/template/ExcelTemplatePicker'
import type { ParsedTemplate } from '../lib/excelTemplate'

export function TemplatePage() {
  const { sections, loading, error, reload, addSection, updateSection, deleteSection, addItem, updateItem, deleteItem, moveSection, moveItem } = useTemplate()
  const run = async (fn: () => Promise<unknown>) => {
    try { await fn() } catch (e) { alert(e instanceof Error ? e.message : 'Не удалось выполнить действие') }
  }
  const [expandedZone, setExpandedZone] = useState<string | null>(null)
  const [addItemModal, setAddItemModal] = useState<{ sectionId: string; sectionName: string } | null>(null)
  const [addSectionModal, setAddSectionModal] = useState<{ type: 'zone' | 'subsection'; parentId?: string } | null>(null)
  const [editItem, setEditItem] = useState<{ id: string; name: string; responsible: string; is_kz: boolean } | null>(null)
  const [newItem, setNewItem] = useState({ name: '', responsible: 'Ген.подрядчик по СМР', is_kz: false })
  const [newSection, setNewSection] = useState('')
  const [saving, setSaving] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importFile, setImportFile] = useState<ParsedTemplate | null>(null)
  const [importing, setImporting] = useState(false)

  const closeImport = () => { setImportOpen(false); setImportFile(null) }
  const handleImport = async () => {
    if (!importFile) return
    setImporting(true)
    try {
      await (await import('../lib/excelTemplate')).replaceTemplate(supabase, importFile)
      closeImport()
      await reload()
    } catch (e) {
      alert('Не удалось заменить шаблон: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setImporting(false)
    }
  }

  if (loading) return <PageLayout title="Шаблон чек-листа" backTo="/"><Spinner className="h-8 w-8 mx-auto mt-12" /></PageLayout>
  if (error) return <PageLayout title="Шаблон чек-листа" backTo="/"><Alert type="error">{error}</Alert></PageLayout>

  const totalItems = sections.reduce((a, z) => a + z.items.length + z.subsections.reduce((b, s) => b + s.items.length, 0), 0)

  return (
    <PageLayout title="Шаблон чек-листа" backTo="/">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-gray-500">Всего пунктов: <strong>{totalItems}</strong></p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>📄 Из Excel</Button>
          <Button size="sm" onClick={() => setAddSectionModal({ type: 'zone' })}>+ Зона</Button>
        </div>
      </div>

      {sections.map(zone => (
        <Card key={zone.id} className="mb-3 overflow-hidden">
          <button
            className="w-full flex items-center gap-3 px-4 py-3 bg-blue-700 text-white text-left hover:bg-blue-800"
            onClick={() => setExpandedZone(expandedZone === zone.id ? null : zone.id)}
          >
            <span className="flex-1 font-semibold text-sm">{zone.name}</span>
            <span className="text-xs opacity-70">{zone.items.length + zone.subsections.reduce((a, s) => a + s.items.length, 0)} пунктов</span>
            <div className="flex gap-1">
              <button className="p-1 hover:bg-blue-600 rounded text-xs" onClick={e => { e.stopPropagation(); run(() => moveSection(zone.id, -1)) }}>↑</button>
              <button className="p-1 hover:bg-blue-600 rounded text-xs" onClick={e => { e.stopPropagation(); run(() => moveSection(zone.id, 1)) }}>↓</button>
              <button
                className="p-1 hover:bg-blue-600 rounded text-xs"
                onClick={e => { e.stopPropagation(); const n = prompt('Новое название зоны:', zone.name); if (n) run(() => updateSection(zone.id, n)) }}
              >✏</button>
              <button
                className="p-1 hover:bg-red-700 rounded text-xs"
                onClick={e => { e.stopPropagation(); if (confirm('Удалить зону со всеми пунктами? Уже созданные акты не изменятся.')) run(() => deleteSection(zone.id)) }}
              >🗑</button>
            </div>
            <span>{expandedZone === zone.id ? '▲' : '▼'}</span>
          </button>

          {expandedZone === zone.id && (
            <div className="p-3 space-y-3">
              {/* Direct items */}
              {zone.items.map(item => (
                <div key={item.id} className="flex items-center gap-2 border-b pb-2">
                  <span className="text-xs text-gray-400 w-8">{item.number}</span>
                  <span className="flex-1 text-sm text-gray-700">{item.name}</span>
                  {item.is_kz && <Badge color="red">КЗ</Badge>}
                  <span className="text-xs text-gray-400">{item.responsible}</span>
                  <button onClick={() => setEditItem({ id: item.id, name: item.name, responsible: item.responsible, is_kz: item.is_kz })} className="text-blue-600 text-xs">✏</button>
                  <button onClick={() => run(() => moveItem(zone.id, item.id, -1))} className="text-gray-500 text-xs px-1">↑</button>
                  <button onClick={() => run(() => moveItem(zone.id, item.id, 1))} className="text-gray-500 text-xs px-1">↓</button>
                  <button onClick={() => { if (confirm('Удалить пункт?')) run(() => deleteItem(item.id)) }} className="text-red-600 text-xs">🗑</button>
                </div>
              ))}

              {/* Subsections */}
              {zone.subsections.map(sub => (
                <div key={sub.id}>
                  <div className="flex items-center gap-2 bg-gray-100 px-3 py-1.5 rounded mb-2">
                    <span className="flex-1 text-xs font-semibold text-gray-600">{sub.name}</span>
                    <button onClick={() => run(() => moveSection(sub.id, -1))} className="text-gray-500 text-xs px-1">↑</button>
                    <button onClick={() => run(() => moveSection(sub.id, 1))} className="text-gray-500 text-xs px-1">↓</button>
                    <button onClick={() => { const n = prompt('Новое название:', sub.name); if (n) run(() => updateSection(sub.id, n)) }} className="text-blue-600 text-xs">✏</button>
                    <button onClick={() => { if (confirm('Удалить подраздел?')) run(() => deleteSection(sub.id)) }} className="text-red-600 text-xs">🗑</button>
                    <button onClick={() => setAddItemModal({ sectionId: sub.id, sectionName: sub.name })} className="text-green-600 text-xs">+ пункт</button>
                  </div>
                  {sub.items.map(item => (
                    <div key={item.id} className="flex items-center gap-2 pl-3 border-b pb-2 mb-1">
                      <span className="text-xs text-gray-400 w-8">{item.number}</span>
                      <span className="flex-1 text-sm text-gray-700">{item.name}</span>
                      {item.is_kz && <Badge color="red">КЗ</Badge>}
                      <span className="text-xs text-gray-400 max-w-[80px] truncate">{item.responsible}</span>
                      <button onClick={() => setEditItem({ id: item.id, name: item.name, responsible: item.responsible, is_kz: item.is_kz })} className="text-blue-600 text-xs">✏</button>
                      <button onClick={() => run(() => moveItem(sub.id, item.id, -1))} className="text-gray-500 text-xs px-1">↑</button>
                      <button onClick={() => run(() => moveItem(sub.id, item.id, 1))} className="text-gray-500 text-xs px-1">↓</button>
                      <button onClick={() => { if (confirm('Удалить пункт?')) run(() => deleteItem(item.id)) }} className="text-red-600 text-xs">🗑</button>
                    </div>
                  ))}
                </div>
              ))}

              <div className="flex gap-2 pt-2">
                <Button size="sm" variant="ghost" onClick={() => setAddItemModal({ sectionId: zone.id, sectionName: zone.name })}>
                  + Пункт в зону
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setAddSectionModal({ type: 'subsection', parentId: zone.id })}>
                  + Подраздел
                </Button>
              </div>
            </div>
          )}
        </Card>
      ))}

      <Modal open={importOpen} onClose={closeImport} title="Загрузить шаблон из Excel">
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Выберите бланк акта в формате .xlsx (того же вида, что и текущий). Его пункты заменят общий шаблон:
            по нему будут создаваться новые акты. Уже созданные акты не изменятся.
          </p>
          <ExcelTemplatePicker value={importFile} onChange={setImportFile} />
          {importFile && (
            <p className="text-sm text-amber-700">Сейчас в шаблоне {totalItems} пунктов, они будут удалены.</p>
          )}
          <Button className="w-full" variant="danger" disabled={!importFile} loading={importing} onClick={handleImport}>
            Заменить шаблон
          </Button>
        </div>
      </Modal>

      {/* Add item modal */}
      <Modal open={!!addItemModal} onClose={() => { setAddItemModal(null); setNewItem({ name: '', responsible: 'Ген.подрядчик по СМР', is_kz: false }) }} title={`Новый пункт — ${addItemModal?.sectionName}`}>
        <div className="space-y-3">
          <Input label="Наименование работ *" value={newItem.name} onChange={e => setNewItem(d => ({ ...d, name: e.target.value }))} />
          <Select
            label="Ответственный"
            value={newItem.responsible}
            onChange={e => setNewItem(d => ({ ...d, responsible: e.target.value }))}
            options={RESPONSIBLE_OPTIONS.map(r => ({ value: r, label: r }))}
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={newItem.is_kz} onChange={e => setNewItem(d => ({ ...d, is_kz: e.target.checked }))} />
            Критичное замечание (КЗ)
          </label>
          <Button
            className="w-full"
            loading={saving}
            disabled={!newItem.name}
            onClick={async () => {
              if (!addItemModal) return
              setSaving(true)
              try { await addItem(addItemModal.sectionId, newItem.name, newItem.responsible, newItem.is_kz); setAddItemModal(null) }
              finally { setSaving(false) }
            }}
          >
            Добавить
          </Button>
        </div>
      </Modal>

      {/* Edit item modal */}
      <Modal open={!!editItem} onClose={() => setEditItem(null)} title="Редактировать пункт">
        {editItem && (
          <div className="space-y-3">
            <Input label="Наименование" value={editItem.name} onChange={e => setEditItem(d => d ? { ...d, name: e.target.value } : null)} />
            <Select
              label="Ответственный"
              value={editItem.responsible}
              onChange={e => setEditItem(d => d ? { ...d, responsible: e.target.value } : null)}
              options={RESPONSIBLE_OPTIONS.map(r => ({ value: r, label: r }))}
            />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={editItem.is_kz} onChange={e => setEditItem(d => d ? { ...d, is_kz: e.target.checked } : null)} />
              Критичное замечание (КЗ)
            </label>
            <Button className="w-full" onClick={async () => {
              if (!editItem) return
              await updateItem(editItem.id, { name: editItem.name, responsible: editItem.responsible, is_kz: editItem.is_kz })
              setEditItem(null)
            }}>Сохранить</Button>
          </div>
        )}
      </Modal>

      {/* Add section modal */}
      <Modal open={!!addSectionModal} onClose={() => { setAddSectionModal(null); setNewSection('') }} title={addSectionModal?.type === 'zone' ? 'Новая зона' : 'Новый подраздел'}>
        <div className="space-y-3">
          <Input label="Название" value={newSection} onChange={e => setNewSection(e.target.value)} />
          <Button
            className="w-full"
            disabled={!newSection}
            loading={saving}
            onClick={async () => {
              if (!addSectionModal) return
              setSaving(true)
              try {
                await addSection(newSection, addSectionModal.type, addSectionModal.parentId)
                setAddSectionModal(null)
                setNewSection('')
              } finally { setSaving(false) }
            }}
          >
            Добавить
          </Button>
        </div>
      </Modal>
    </PageLayout>
  )
}
