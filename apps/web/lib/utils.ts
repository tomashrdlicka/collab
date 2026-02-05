import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffSec < 60) {
    return 'just now'
  } else if (diffMin < 60) {
    return `${diffMin} min ago`
  } else if (diffHour < 24) {
    return `${diffHour} hour${diffHour > 1 ? 's' : ''} ago`
  } else if (diffDay < 7) {
    return `${diffDay} day${diffDay > 1 ? 's' : ''} ago`
  } else {
    return formatDate(d)
  }
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export function generateShareCode(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - 3) + '...'
}

export function getFileIcon(path: string): string {
  if (path.endsWith('.md')) return 'file-text'
  if (path.endsWith('.json')) return 'file-code'
  if (path.endsWith('.yaml') || path.endsWith('.yml')) return 'file-code'
  return 'file'
}

export function getChangeTypeLabel(type: 'create' | 'update' | 'delete'): string {
  switch (type) {
    case 'create':
      return 'Created'
    case 'update':
      return 'Updated'
    case 'delete':
      return 'Deleted'
  }
}

export function getChangeTypeColor(type: 'create' | 'update' | 'delete'): string {
  switch (type) {
    case 'create':
      return 'text-green-500'
    case 'update':
      return 'text-yellow-500'
    case 'delete':
      return 'text-red-500'
  }
}
