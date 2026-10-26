import React, { useEffect, useState } from 'react'
import { PageLayout } from '../components/layout/PageLayout'
import { supabase } from '../lib/supabase'
import { Button, Badge, Select, Spinner, Card, Alert } from '../components/ui'
import type { Profile } from '../types'
import { formatDate } from '../lib/dateUtils'

interface StorageStats {
  photos_used_mb: number
  photos_limit_mb: number
  db_used_mb: number
  db_limit_mb: number
}

export function AdminPage() {
  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [storage, setStorage] = useState<StorageStats | null>(null)
  const [storageLoading, setStorageLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadUsers = async () => {
    setLoading(true)
    try {
      const { data, error: err } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
      if (err) throw err
      setUsers((data || []) as Profile[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки')
    } finally {
      setLoading(false)
    }
  }

  const loadStorage = async () => {
    setStorageLoading(true)
    try {
      // DB size from Supabase RPC
      const { data: dbData } = await supabase.rpc('get_db_size')
      const { data: photoBytes } = await supabase.rpc('get_storage_size')

      setStorage({
        photos_used_mb: photoBytes ? Math.round(Number(photoBytes) / 1024 / 1024) : 0,
        photos_limit_mb: 1024,
        db_used_mb: dbData ? Math.round(dbData / 1024 / 1024) : 0,
        db_limit_mb: 500,
      })
    } catch {
      // Ignore storage errors
    } finally {
      setStorageLoading(false)
    }
  }

  useEffect(() => { loadUsers(); loadStorage() }, [])

  const updateRole = async (userId: string, role: string) => {
    await supabase.from('profiles').update({ role }).eq('id', userId)
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: role as Profile['role'] } : u))
  }

  const StorageBar = ({ used, limit, unit, warnAt }: { used: number; limit: number; unit: string; warnAt: number }) => {
    const pct = Math.min(100, Math.round(used / limit * 100))
    const isWarn = pct >= warnAt
    return (
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-gray-500">
          <span>{used.toFixed(2)} {unit} из {limit} {unit}</span>
          <span className={isWarn ? 'text-red-600 font-bold' : ''}>{pct}%</span>
        </div>
        <div className="bg-gray-200 rounded-full h-2">
          <div className={`h-2 rounded-full ${isWarn ? 'bg-red-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
        </div>
        {isWarn && <p className="text-xs text-red-600">⚠ Использовано более 80% лимита!</p>}
      </div>
    )
  }

  return (
    <PageLayout title="Администрирование" backTo="/">
      {error && <Alert type="error">{error}</Alert>}

      {/* Storage stats */}
      <Card className="p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-800">Использование хранилища</h2>
          {storageLoading ? <Spinner className="h-4 w-4" /> : (
            <Button size="sm" variant="ghost" onClick={loadStorage}>Обновить</Button>
          )}
        </div>
        {storage ? (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-gray-700 mb-1">Фото (Supabase Storage)</p>
              <StorageBar used={storage.photos_used_mb} limit={storage.photos_limit_mb} unit="МБ" warnAt={80} />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700 mb-1">База данных (Supabase)</p>
              <StorageBar used={storage.db_used_mb} limit={storage.db_limit_mb} unit="МБ" warnAt={80} />
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-400">Загрузка статистики...</p>
        )}
      </Card>

      {/* Template link */}
      <Card className="p-4 mb-4">
        <h2 className="font-semibold text-gray-800 mb-2">Управление шаблоном</h2>
        <p className="text-sm text-gray-600 mb-3">Редактирование пунктов чек-листа, зон и подразделов</p>
        <Button onClick={() => window.location.href = `${import.meta.env.BASE_URL}template`}>Открыть шаблон</Button>
      </Card>

      {/* Users */}
      <Card className="p-4">
        <h2 className="font-semibold text-gray-800 mb-3">Пользователи ({users.length})</h2>
        {loading ? (
          <Spinner className="h-6 w-6 mx-auto" />
        ) : (
          <div className="space-y-2">
            {users.map(u => (
              <div key={u.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{u.full_name || u.email}</p>
                  <p className="text-xs text-gray-500">{u.email}</p>
                  {u.organization && <p className="text-xs text-gray-400">{u.organization}</p>}
                </div>
                <Select
                  value={u.role}
                  onChange={e => updateRole(u.id, e.target.value)}
                  options={[
                    { value: 'admin', label: 'Администратор' },
                    { value: 'engineer', label: 'Инженер' },
                    { value: 'contractor', label: 'Подрядчик' },
                  ]}
                  className="text-xs w-auto"
                />
              </div>
            ))}
          </div>
        )}
      </Card>
    </PageLayout>
  )
}
