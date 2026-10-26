import React, { useState } from 'react'
import { Input, Button, Card } from '../ui'
import { SignatureCanvas } from './SignatureCanvas'
import type { CommissionMember, Act } from '../../types'
import { formatDate, toInputDate, todayISO } from '../../lib/dateUtils'

interface CommissionBlockProps {
  actId: string
  members: CommissionMember[]
  act: Act
  allFixed: boolean
  gcHasOpenDefects: boolean
  onSaveMember: (m: Partial<CommissionMember> & { act_id: string }) => Promise<void>
  onUpdateAct: (updates: Partial<Act>) => Promise<void>
}

const r2 = (key: string) => `${import.meta.env.VITE_R2_PUBLIC_URL}/${key}`

function SignedPerson({ m, title }: { m: CommissionMember | undefined; title: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-gray-500">{title}</p>
      <p className="text-sm font-medium min-h-5">{m?.full_name || '________________'}</p>
      <p className="text-[11px] text-gray-400">(ФИО)</p>
      {m?.signature_key
        ? <img src={r2(m.signature_key)} alt="подпись" className="h-10" />
        : <p className="text-xs text-gray-300 border-b border-gray-300 w-24 h-6">&nbsp;</p>}
      <p className="text-[11px] text-gray-400">(подпись)</p>
    </div>
  )
}

export function CommissionBlock({ actId, members, act, allFixed, gcHasOpenDefects, onSaveMember, onUpdateAct }: CommissionBlockProps) {
  const chairman = members.find(m => m.role_type === 'chairman')
  const membersList = members.filter(m => m.role_type === 'member')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editData, setEditData] = useState({ full_name: '', organization: '', position: '' })
  const [saveError, setSaveError] = useState<string | null>(null)

  const startEdit = (m: CommissionMember) => {
    setEditingId(m.id)
    setEditData({ full_name: m.full_name || '', organization: m.organization || '', position: m.position || '' })
  }

  const saveEdit = async (m: CommissionMember) => {
    setSaveError(null)
    try {
      await onSaveMember({ ...m, act_id: actId, ...editData })
      setEditingId(null)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Не удалось сохранить')
    }
  }

  const engineer = members.find(m => m.position.startsWith('Инженер-строитель'))
  const chiefEngineer = members.find(m => m.position.startsWith('Главный инженер'))

  const saveActField = async (updates: Partial<Act>) => {
    setSaveError(null)
    try { await onUpdateAct(updates) } catch (e) { setSaveError(e instanceof Error ? e.message : 'Не удалось сохранить') }
  }

  const renderMember = (m: CommissionMember) => (
    <div key={m.id} className="border border-gray-200 rounded-lg p-3 mb-2">
      <p className="text-xs text-gray-500 font-medium mb-2">{m.position || 'Свободная строка (укажите должность)'}</p>
      {editingId === m.id ? (
        <div className="space-y-2">
          <Input label="Должность" value={editData.position} onChange={e => setEditData(d => ({ ...d, position: e.target.value }))} />
          <Input label="ФИО" value={editData.full_name} onChange={e => setEditData(d => ({ ...d, full_name: e.target.value }))} />
          <Input label="Организация" value={editData.organization} onChange={e => setEditData(d => ({ ...d, organization: e.target.value }))} />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => saveEdit(m)}>Сохранить</Button>
            <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Отмена</Button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            {m.full_name && <p className="text-sm font-medium break-words">{m.full_name}</p>}
            {m.organization && <p className="text-xs text-gray-500 break-words">{m.organization}</p>}
            {!m.full_name && <p className="text-sm text-gray-300 italic">ФИО не указано</p>}
          </div>
          <div className="flex items-center gap-2">
            <SignatureCanvas
              actId={actId}
              memberId={m.id}
              existingKey={m.signature_key}
              onSaved={key => onSaveMember({ ...m, act_id: actId, signature_key: key })}
            />
            <Button size="sm" variant="ghost" onClick={() => startEdit(m)}>✏</Button>
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div className="space-y-4">
      {saveError && <p className="text-sm text-red-600">{saveError}</p>}

      {chairman && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Председатель комиссии</h3>
          {renderMember(chairman)}
        </Card>
      )}

      <Card className="p-4">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Члены комиссии</h3>
        {membersList.map(renderMember)}
      </Card>

      <Card className="p-4 space-y-4">
        <h3 className="text-sm font-semibold text-gray-800">Итоговые заключения</h3>

        <div className={`border rounded-lg p-3 space-y-3 ${gcHasOpenDefects ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-300'}`}>
          <p className="text-sm text-gray-700">
            1. Замечания к генеральному подрядчику по СМР «{act.gen_contractor_name || '____________'}» отсутствуют.
            Согласована оплата выполненных работ по договору ген. подряда «{act.payment_date ? formatDate(act.payment_date) : '__.__.____'}».
          </p>
          {gcHasOpenDefects && (
            <p className="text-xs text-amber-600">Есть неустранённые замечания к генеральному подрядчику — заключение пока не соответствует действительности.</p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Input
              label="Генеральный подрядчик по СМР"
              defaultValue={act.gen_contractor_name || ''}
              onBlur={e => e.target.value !== (act.gen_contractor_name || '') && saveActField({ gen_contractor_name: e.target.value || null })}
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Дата оплаты по договору</label>
              <input
                type="date"
                defaultValue={toInputDate(act.payment_date)}
                onBlur={e => saveActField({ payment_date: e.target.value || null })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <SignedPerson m={engineer} title="Инженер-строитель" />
            <SignedPerson m={chiefEngineer} title="Главный инженер" />
          </div>
        </div>

        <div className={`border rounded-lg p-3 space-y-3 ${allFixed ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
          {allFixed ? (
            <>
              <p className="text-sm text-green-900">
                2. Работы выполнены. Замечания устранены в полном объёме. Исполнительная документация сдана (согласно Приложения №2).
                Объект принят в эксплуатацию «{formatDate(act.commissioning_date || act.last_fix_date || todayISO())}».
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Дата приёмки в эксплуатацию</label>
                <input
                  type="date"
                  defaultValue={toInputDate(act.commissioning_date || act.last_fix_date || todayISO())}
                  onBlur={e => saveActField({ commissioning_date: e.target.value || null })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <SignedPerson m={engineer} title="Инженер-строитель" />
                <SignedPerson m={chiefEngineer} title="Главный инженер" />
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-400 italic">
              Заключение 2 («Объект принят в эксплуатацию») станет доступно, когда все замечания будут в статусе «Устранено».
            </p>
          )}
        </div>
      </Card>
    </div>
  )
}
