import React from 'react'
import { Header } from './Header'

interface PageLayoutProps {
  title?: string
  backTo?: string
  children: React.ReactNode
  actions?: React.ReactNode
}

export function PageLayout({ title, backTo, children, actions }: PageLayoutProps) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header title={title} backTo={backTo} />
      {actions && (
        <div className="bg-white border-b px-4 py-2 flex gap-2 justify-end max-w-4xl mx-auto w-full">
          {actions}
        </div>
      )}
      <main className="flex-1 max-w-4xl mx-auto w-full px-3 py-4">
        {children}
      </main>
    </div>
  )
}
