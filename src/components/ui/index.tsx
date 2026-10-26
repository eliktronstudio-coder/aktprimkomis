import React from 'react'

// Button
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}
export function Button({ variant = 'primary', size = 'md', loading, children, className = '', disabled, ...rest }: ButtonProps) {
  const base = 'inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed'
  const variants = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500',
    secondary: 'bg-gray-100 text-gray-700 hover:bg-gray-200 focus:ring-gray-400',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
    ghost: 'text-gray-600 hover:bg-gray-100 focus:ring-gray-300',
    outline: 'border border-gray-300 text-gray-700 hover:bg-gray-50 focus:ring-gray-300',
  }
  const sizes = { sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2 text-sm', lg: 'px-5 py-3 text-base' }
  return (
    <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} disabled={disabled || loading} {...rest}>
      {loading ? <span className="mr-2 animate-spin">⏳</span> : null}
      {children}
    </button>
  )
}

// Input
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}
export function Input({ label, error, className = '', ...rest }: InputProps) {
  return (
    <div className="w-full">
      {label && <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>}
      <input
        className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${error ? 'border-red-400' : 'border-gray-300'} ${className}`}
        {...rest}
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}

// Textarea
interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
}
export function Textarea({ label, className = '', ...rest }: TextareaProps) {
  return (
    <div className="w-full">
      {label && <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>}
      <textarea
        className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${className}`}
        rows={3}
        {...rest}
      />
    </div>
  )
}

// Select
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  options: Array<{ value: string; label: string }>
}
export function Select({ label, options, className = '', ...rest }: SelectProps) {
  return (
    <div className="w-full">
      {label && <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>}
      <select
        className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white ${className}`}
        {...rest}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

// Badge
interface BadgeProps {
  color?: 'red' | 'green' | 'gray' | 'amber' | 'blue'
  children: React.ReactNode
  className?: string
}
export function Badge({ color = 'gray', children, className = '' }: BadgeProps) {
  const colors = {
    red: 'bg-red-100 text-red-700 border border-red-200',
    green: 'bg-green-100 text-green-700 border border-green-200',
    gray: 'bg-gray-100 text-gray-600 border border-gray-200',
    amber: 'bg-amber-100 text-amber-700 border border-amber-200',
    blue: 'bg-blue-100 text-blue-700 border border-blue-200',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${colors[color]} ${className}`}>
      {children}
    </span>
  )
}

// Toggle
interface ToggleProps {
  checked: boolean
  onChange: (v: boolean) => void
  labelOn?: string
  labelOff?: string
  disabled?: boolean
}
export function Toggle({ checked, onChange, labelOn = 'Да', labelOff = 'Нет', disabled }: ToggleProps) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`relative inline-flex items-center h-7 w-14 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 ${checked ? 'bg-red-500' : 'bg-gray-300'}`}
    >
      <span className={`absolute inline-flex w-6 h-6 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-7' : 'translate-x-0.5'}`} />
      <span className={`absolute text-xs font-bold text-white ${checked ? 'left-1' : 'right-1'}`}>
        {checked ? labelOn : labelOff}
      </span>
    </button>
  )
}

// Modal
interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
}
export function Modal({ open, onClose, title, children }: ModalProps) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white w-full sm:max-w-lg sm:rounded-xl max-h-[90vh] overflow-y-auto rounded-t-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b sticky top-0 bg-white z-10">
          {title && <h3 className="font-semibold text-gray-900">{title}</h3>}
          <button onClick={onClose} className="ml-auto text-gray-400 hover:text-gray-600 p-1">✕</button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}

// Spinner
export function Spinner({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-spin rounded-full border-2 border-gray-200 border-t-blue-600 ${className || 'h-6 w-6'}`} />
  )
}

// Card
interface CardProps {
  children: React.ReactNode
  className?: string
  onClick?: () => void
}
export function Card({ children, className = '', onClick }: CardProps) {
  return <div className={`bg-white rounded-xl shadow-sm border border-gray-100 ${className}`} onClick={onClick}>{children}</div>
}

// Alert
export function Alert({ type = 'info', children }: { type?: 'info' | 'error' | 'success' | 'warning'; children: React.ReactNode }) {
  const styles = {
    info: 'bg-blue-50 text-blue-800 border-blue-200',
    error: 'bg-red-50 text-red-800 border-red-200',
    success: 'bg-green-50 text-green-800 border-green-200',
    warning: 'bg-amber-50 text-amber-800 border-amber-200',
  }
  return <div className={`px-4 py-3 rounded-lg border text-sm ${styles[type]}`}>{children}</div>
}
