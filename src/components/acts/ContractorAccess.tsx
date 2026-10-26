import React, { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Button, Card, Select, Spinner, Alert } from '../ui'
import { RESPONSIBLE_OPTIONS } from '../../types'

interface Row {
  user_id: string
  responsible: string
  profile: { full_name: string | null; email: string | null } | null
}
interface Contractor { id: string; full_name: string | null; email: string | null; organization: string | null }

export function ContractorAccess({ actId }: { actId: string }) {
  const [rows, setRows] = useState<Row[]>([])
  const [contractors, setContractors] = useState<Contractor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [userId, setUserId] = useState('')
  const [responsible, setResponsible] = useState(RESPONSIBLE_OPTIONS[0] as string)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [acc, users] = await Promise.all([
      supabase.from('act_contractors').select('user_id, responsible, profile:profiles(full_name,email)').eq('act_id', actId),
      supabase.from('profiles').select('id, full_name, email, organization').eq('role', 'contractor').order('email'),
    ])
    if (acc.error) setError(acc.error.message)
    else setRows((acc.data ?? []) as unknown as Row[])
    setContractors((users.data ?? []) as Contractor[])
    setLoading(false)
  }, [actId])

  useEffect(() => { load() }, [load])

  const add = async () => {
    if (!userId) return
    setSaving(true)
    setError(null)
    const { error: err } = await supabase.from('act_contractors').upsert({ act_id: actId, user_id: userId, responsible })
    if (err) setError(err.message)
    setSaving(false)
    await load()
  }

  const remove = async (uid: string) => {
    const { error: err } = await supabase.from('act_contractors').delete().eq('act_id', actId).eq('user_id', uid)
    if (err) setError(err.message)
    await load()
  }

  if (loading) return <Spinner className="h-6 w-6 mx-auto my-8" />

  return (
    <Card className="p-4 space-y-4">
      <div>
        <h2 className="font-semibold text-gray-800">Доступ подрядчиков</h2>
        <p className="text-xs text-gray-500 mt-1">
          Подрядчик видит только этот акт и только замечания выбранного ответственного. Пользователь с ролью
          «Подрядчик» создаётся регистрацией на сайте, роль назначает администратор.
        </p>
      </div>
      {error && <Alert type="error">{error}</Alert>}

      {rows.length === 0 && <p className="text-sm text-gray-400">Подрядчики не добавлены</p>}
      {rows.map(r => (
        <div key={r.user_id} className="flex items-center gap-2 border-b pb-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{r.profile?.full_name || r.profile?.email}</p>
            <p className="text-xs text-gray-500">{r.responsible}</p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => remove(r.user_id)}>Убрать</Button>
        </div>
      ))}

      <div className="space-y-2 pt-2">
        <Select
          label="Подрядчик"
          value={userId}
          onChange={e => setUserId(e.target.value)}
          options={[{ value: '', label: contractors.length ? 'Выберите…' : 'Нет пользователей с ролью «Подрядчик»' },
            ...contractors.map(c => ({ value: c.id, label: c.full_name || c.email || c.id }))]}
        />
        <Select
          label="Ответственный в акте"
          value={responsible}
          onChange={e => setResponsible(e.target.value)}
          options={RESPONSIBLE_OPTIONS.map(r => ({ value: r, label: r }))}
        />
        <Button onClick={add} loading={saving} disabled={!userId}>Добавить</Button>
      </div>
    </Card>
  )
}
