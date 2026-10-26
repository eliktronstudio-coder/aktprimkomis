import { useEffect, useState, useCallback } from 'react'
import { getQueue, onQueueChanged, processQueue, retryFailed } from '../lib/offlineQueue'

export function useOfflineQueue() {
  const [queueCount, setQueueCount] = useState(0)
  const [failedCount, setFailedCount] = useState(0)
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  const refresh = useCallback(async () => {
    const q = await getQueue()
    setQueueCount(q.length)
    setFailedCount(q.filter(i => i.lastError).length)
  }, [])

  useEffect(() => {
    refresh()
    processQueue()
    const off = onQueueChanged(refresh)
    const handleOnline = () => { setIsOnline(true); processQueue() }
    const handleOffline = () => setIsOnline(false)
    const timer = window.setInterval(processQueue, 20000)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      off()
      window.clearInterval(timer)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [refresh])

  return { queueCount, failedCount, isOnline, processQueue, retryFailed }
}
