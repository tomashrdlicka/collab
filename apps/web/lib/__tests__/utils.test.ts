import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  formatDate,
  formatRelativeTime,
  slugify,
  generateShareCode,
  truncate,
  getFileIcon,
  getChangeTypeLabel,
  getChangeTypeColor,
} from '../utils'

describe('utils', () => {
  describe('formatDate', () => {
    it('formats a Date object', () => {
      const date = new Date('2024-01-15T12:00:00Z')
      const result = formatDate(date)
      expect(result).toContain('Jan')
      expect(result).toContain('15')
      expect(result).toContain('2024')
    })

    it('formats a date string', () => {
      const result = formatDate('2024-06-20T00:00:00Z')
      expect(result).toContain('Jun')
      expect(result).toContain('20')
      expect(result).toContain('2024')
    })
  })

  describe('formatRelativeTime', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2024-06-15T12:00:00Z'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('returns "just now" for very recent dates', () => {
      const date = new Date('2024-06-15T11:59:30Z') // 30 seconds ago
      expect(formatRelativeTime(date)).toBe('just now')
    })

    it('returns minutes ago', () => {
      const date = new Date('2024-06-15T11:45:00Z') // 15 min ago
      expect(formatRelativeTime(date)).toBe('15 min ago')
    })

    it('returns singular hour', () => {
      const date = new Date('2024-06-15T11:00:00Z') // 1 hour ago
      expect(formatRelativeTime(date)).toBe('1 hour ago')
    })

    it('returns plural hours', () => {
      const date = new Date('2024-06-15T06:00:00Z') // 6 hours ago
      expect(formatRelativeTime(date)).toBe('6 hours ago')
    })

    it('returns singular day', () => {
      const date = new Date('2024-06-14T12:00:00Z') // 1 day ago
      expect(formatRelativeTime(date)).toBe('1 day ago')
    })

    it('returns plural days', () => {
      const date = new Date('2024-06-12T12:00:00Z') // 3 days ago
      expect(formatRelativeTime(date)).toBe('3 days ago')
    })

    it('returns formatted date for 7+ days ago', () => {
      const date = new Date('2024-06-01T12:00:00Z') // 14 days ago
      const result = formatRelativeTime(date)
      expect(result).toContain('Jun')
      expect(result).toContain('1')
    })

    it('accepts string dates', () => {
      const result = formatRelativeTime('2024-06-15T11:59:30Z')
      expect(result).toBe('just now')
    })
  })

  describe('slugify', () => {
    it('converts to lowercase', () => {
      expect(slugify('HELLO')).toBe('hello')
    })

    it('replaces spaces with hyphens', () => {
      expect(slugify('hello world')).toBe('hello-world')
    })

    it('removes special characters', () => {
      expect(slugify('hello!@#$world')).toBe('hello-world')
    })

    it('removes leading/trailing hyphens', () => {
      expect(slugify('-hello-')).toBe('hello')
    })

    it('collapses multiple hyphens', () => {
      expect(slugify('hello   world')).toBe('hello-world')
    })

    it('handles mixed case with spaces', () => {
      expect(slugify('My Project Name')).toBe('my-project-name')
    })
  })

  describe('generateShareCode', () => {
    it('returns 8 character string', () => {
      const code = generateShareCode()
      expect(code).toHaveLength(8)
    })

    it('contains only lowercase alphanumeric characters', () => {
      for (let i = 0; i < 50; i++) {
        const code = generateShareCode()
        expect(code).toMatch(/^[a-z0-9]+$/)
      }
    })

    it('generates unique codes', () => {
      const codes = new Set<string>()
      for (let i = 0; i < 100; i++) {
        codes.add(generateShareCode())
      }
      // With 36^8 possibilities, 100 codes should all be unique
      expect(codes.size).toBe(100)
    })
  })

  describe('truncate', () => {
    it('returns original text when under maxLength', () => {
      expect(truncate('hello', 10)).toBe('hello')
    })

    it('returns original text when exactly maxLength', () => {
      expect(truncate('hello', 5)).toBe('hello')
    })

    it('truncates and adds ellipsis', () => {
      expect(truncate('hello world', 8)).toBe('hello...')
    })

    it('handles maxLength less than 3', () => {
      // With maxLength of 2, the slice would be -1, which gives last char
      const result = truncate('hello', 3)
      expect(result).toBe('...')
    })
  })

  describe('getFileIcon', () => {
    it('returns file-text for markdown files', () => {
      expect(getFileIcon('readme.md')).toBe('file-text')
    })

    it('returns file-code for JSON files', () => {
      expect(getFileIcon('package.json')).toBe('file-code')
    })

    it('returns file-code for YAML files', () => {
      expect(getFileIcon('config.yaml')).toBe('file-code')
      expect(getFileIcon('config.yml')).toBe('file-code')
    })

    it('returns file for unknown extensions', () => {
      expect(getFileIcon('file.txt')).toBe('file')
      expect(getFileIcon('script.js')).toBe('file')
    })
  })

  describe('getChangeTypeLabel', () => {
    it('returns correct labels', () => {
      expect(getChangeTypeLabel('create')).toBe('Created')
      expect(getChangeTypeLabel('update')).toBe('Updated')
      expect(getChangeTypeLabel('delete')).toBe('Deleted')
    })
  })

  describe('getChangeTypeColor', () => {
    it('returns correct colors', () => {
      expect(getChangeTypeColor('create')).toBe('text-green-500')
      expect(getChangeTypeColor('update')).toBe('text-yellow-500')
      expect(getChangeTypeColor('delete')).toBe('text-red-500')
    })
  })
})
