import React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { useOfflineQueue } from '../../hooks/useOfflineQueue'

interface HeaderProps {
  title?: string
  backTo?: string
}

export function Header({ title = 'Приёмочная комиссия', backTo }: HeaderProps) {
  const { profile, signOut } = useAuthStore()
  const { queueCount, failedCount, isOnline, retryFailed } = useOfflineQueue()
  const navigate = useNavigate()

  return (
    <header className="bg-blue-600 text-white sticky top-0 z-40 shadow-sm">
      <div className="flex items-center h-14 px-3 gap-2 max-w-4xl mx-auto">
        {backTo && (
          <button onClick={() => navigate(backTo)} className="p-2 -ml-2 rounded-lg hover:bg-blue-700">
            ←
          </button>
        )}
        <h1 className="flex-1 font-semibold text-base truncate">{title}</h1>

        {!isOnline && (
          <span className="text-xs bg-amber-500 px-2 py-0.5 rounded-full whitespace-nowrap">Офлайн</span>
        )}
        {queueCount > 0 && (
          <button
            onClick={() => retryFailed()}
            title={failedCount > 0 ? 'Часть изменений отклонена сервером. Нажмите, чтобы повторить' : 'Есть неотправленные изменения'}
            className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${failedCount > 0 ? 'bg-red-500 text-white' : 'bg-yellow-400 text-yellow-900'}`}
          >
            ● {queueCount} неотпр.{failedCount > 0 ? ' · ошибка' : ''}
          </button>
        )}

        {profile && (
          <div className="relative group">
            <button className="flex items-center gap-1 text-sm p-1 rounded-lg hover:bg-blue-700">
              <span className="hidden sm:block max-w-[120px] truncate">{profile.full_name || profile.email}</span>
              <span className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center text-sm font-bold">
                {(profile.full_name || profile.email || '?')[0].toUpperCase()}
              </span>
            </button>
            <div className="absolute right-0 top-full mt-1 w-48 bg-white text-gray-800 rounded-xl shadow-lg border hidden group-hover:block">
              <div className="px-3 py-2 border-b">
                <p className="text-xs text-gray-500">{profile.email}</p>
                <p className="text-xs font-medium capitalize">{
                  profile.role === 'admin' ? 'Администратор' :
                  profile.role === 'engineer' ? 'Инженер' : 'Подрядчик'
                }</p>
              </div>
              {profile.role === 'admin' && (
                <Link to="/admin" className="block px-3 py-2 text-sm hover:bg-gray-50">Администрирование</Link>
              )}
              <button onClick={() => signOut()} className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-gray-50">
                Выйти
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
