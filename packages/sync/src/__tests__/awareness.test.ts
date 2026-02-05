import { describe, it, expect } from 'vitest'
import {
  getUserColor,
  createUserPresence,
  updateCursor,
  clearCursor,
  isCursorInRange,
  getCursorPosition,
  isSelection,
  getSelectionRange,
  formatPresenceLabel,
  sortPresences,
  getActivePresences,
  groupPresencesByLine,
} from '../awareness'
import { PRESENCE_COLORS } from '@collab/shared'
import type { UserPresence } from '@collab/shared'

describe('awareness', () => {
  describe('getUserColor', () => {
    it('returns a color from PRESENCE_COLORS', () => {
      const color = getUserColor('user-123')
      expect(PRESENCE_COLORS).toContain(color)
    })

    it('returns the same color for the same user ID', () => {
      const color1 = getUserColor('consistent-id')
      const color2 = getUserColor('consistent-id')
      expect(color1).toBe(color2)
    })

    it('returns a valid hex color string', () => {
      const color = getUserColor('any-user')
      expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/)
    })

    it('handles empty string', () => {
      const color = getUserColor('')
      expect(PRESENCE_COLORS).toContain(color)
    })
  })

  describe('createUserPresence', () => {
    it('creates presence with correct fields', () => {
      const presence = createUserPresence('user-1', 'Alice', 'human')
      expect(presence.id).toBe('user-1')
      expect(presence.name).toBe('Alice')
      expect(presence.type).toBe('human')
      expect(presence.cursor).toBeNull()
      expect(presence.color).toBeTruthy()
    })

    it('includes agentName when provided', () => {
      const presence = createUserPresence('agent-1', 'Bot', 'agent', 'ClaudeBot')
      expect(presence.agentName).toBe('ClaudeBot')
    })

    it('does not include agentName when not provided', () => {
      const presence = createUserPresence('user-1', 'Alice', 'human')
      expect(presence.agentName).toBeUndefined()
    })

    it('assigns color from getUserColor', () => {
      const presence = createUserPresence('user-1', 'Alice', 'human')
      expect(presence.color).toBe(getUserColor('user-1'))
    })
  })

  describe('updateCursor', () => {
    it('returns new presence with cursor set', () => {
      const presence = createUserPresence('user-1', 'Alice', 'human')
      const updated = updateCursor(presence, 10, 20)
      expect(updated.cursor).toEqual({ anchor: 10, head: 20 })
    })

    it('does not mutate original', () => {
      const presence = createUserPresence('user-1', 'Alice', 'human')
      updateCursor(presence, 10, 20)
      expect(presence.cursor).toBeNull()
    })

    it('preserves other fields', () => {
      const presence = createUserPresence('user-1', 'Alice', 'human')
      const updated = updateCursor(presence, 5, 5)
      expect(updated.id).toBe(presence.id)
      expect(updated.name).toBe(presence.name)
      expect(updated.color).toBe(presence.color)
      expect(updated.type).toBe(presence.type)
    })
  })

  describe('clearCursor', () => {
    it('returns new presence with cursor null', () => {
      const presence = createUserPresence('user-1', 'Alice', 'human')
      const withCursor = updateCursor(presence, 10, 20)
      const cleared = clearCursor(withCursor)
      expect(cleared.cursor).toBeNull()
    })

    it('does not mutate original', () => {
      const withCursor = updateCursor(
        createUserPresence('user-1', 'Alice', 'human'),
        10,
        20
      )
      clearCursor(withCursor)
      expect(withCursor.cursor).toEqual({ anchor: 10, head: 20 })
    })
  })

  describe('isCursorInRange', () => {
    it('returns true when cursor overlaps range', () => {
      expect(isCursorInRange({ anchor: 5, head: 15 }, 10, 20)).toBe(true)
    })

    it('returns true when cursor is inside range', () => {
      expect(isCursorInRange({ anchor: 12, head: 18 }, 10, 20)).toBe(true)
    })

    it('returns false when cursor is before range', () => {
      expect(isCursorInRange({ anchor: 1, head: 5 }, 10, 20)).toBe(false)
    })

    it('returns false when cursor is after range', () => {
      expect(isCursorInRange({ anchor: 25, head: 30 }, 10, 20)).toBe(false)
    })

    it('handles reversed anchor/head', () => {
      expect(isCursorInRange({ anchor: 15, head: 5 }, 10, 20)).toBe(true)
    })

    it('handles point cursor (anchor === head)', () => {
      expect(isCursorInRange({ anchor: 15, head: 15 }, 10, 20)).toBe(true)
      expect(isCursorInRange({ anchor: 5, head: 5 }, 10, 20)).toBe(false)
    })
  })

  describe('getCursorPosition', () => {
    it('returns head position', () => {
      expect(getCursorPosition({ anchor: 10, head: 20 })).toBe(20)
    })

    it('returns head even when anchor is larger', () => {
      expect(getCursorPosition({ anchor: 20, head: 10 })).toBe(10)
    })
  })

  describe('isSelection', () => {
    it('returns true when anchor differs from head', () => {
      expect(isSelection({ anchor: 10, head: 20 })).toBe(true)
    })

    it('returns false when anchor equals head', () => {
      expect(isSelection({ anchor: 10, head: 10 })).toBe(false)
    })
  })

  describe('getSelectionRange', () => {
    it('returns normalized start/end', () => {
      const range = getSelectionRange({ anchor: 10, head: 20 })
      expect(range.start).toBe(10)
      expect(range.end).toBe(20)
    })

    it('normalizes reversed selection', () => {
      const range = getSelectionRange({ anchor: 20, head: 10 })
      expect(range.start).toBe(10)
      expect(range.end).toBe(20)
    })

    it('handles point selection', () => {
      const range = getSelectionRange({ anchor: 5, head: 5 })
      expect(range.start).toBe(5)
      expect(range.end).toBe(5)
    })
  })

  describe('formatPresenceLabel', () => {
    it('returns name for human users', () => {
      const presence = createUserPresence('user-1', 'Alice', 'human')
      expect(formatPresenceLabel(presence)).toBe('Alice')
    })

    it('returns agentName for agents', () => {
      const presence = createUserPresence('agent-1', 'Bot', 'agent', 'ClaudeBot')
      expect(formatPresenceLabel(presence)).toBe('ClaudeBot')
    })

    it('returns name for agents without agentName', () => {
      const presence = createUserPresence('agent-1', 'Bot', 'agent')
      expect(formatPresenceLabel(presence)).toBe('Bot')
    })
  })

  describe('sortPresences', () => {
    it('sorts humans before agents', () => {
      const presences: UserPresence[] = [
        createUserPresence('agent-1', 'Bot', 'agent'),
        createUserPresence('user-1', 'Alice', 'human'),
        createUserPresence('agent-2', 'Bot2', 'agent'),
        createUserPresence('user-2', 'Bob', 'human'),
      ]

      const sorted = sortPresences(presences)
      expect(sorted[0]!.type).toBe('human')
      expect(sorted[1]!.type).toBe('human')
      expect(sorted[2]!.type).toBe('agent')
      expect(sorted[3]!.type).toBe('agent')
    })

    it('sorts alphabetically within same type', () => {
      const presences: UserPresence[] = [
        createUserPresence('user-2', 'Zara', 'human'),
        createUserPresence('user-1', 'Alice', 'human'),
      ]

      const sorted = sortPresences(presences)
      expect(sorted[0]!.name).toBe('Alice')
      expect(sorted[1]!.name).toBe('Zara')
    })

    it('does not mutate original array', () => {
      const presences: UserPresence[] = [
        createUserPresence('agent-1', 'Bot', 'agent'),
        createUserPresence('user-1', 'Alice', 'human'),
      ]

      sortPresences(presences)
      expect(presences[0]!.type).toBe('agent') // Original unchanged
    })
  })

  describe('getActivePresences', () => {
    it('returns only presences with cursors', () => {
      const p1 = updateCursor(createUserPresence('u1', 'Alice', 'human'), 0, 10)
      const p2 = createUserPresence('u2', 'Bob', 'human') // no cursor
      const p3 = updateCursor(createUserPresence('u3', 'Charlie', 'human'), 5, 5)

      const active = getActivePresences([p1, p2, p3])
      expect(active).toHaveLength(2)
      expect(active.map((p) => p.name)).toEqual(['Alice', 'Charlie'])
    })

    it('returns empty array when no cursors active', () => {
      const presences = [
        createUserPresence('u1', 'Alice', 'human'),
        createUserPresence('u2', 'Bob', 'human'),
      ]
      expect(getActivePresences(presences)).toHaveLength(0)
    })
  })

  describe('groupPresencesByLine', () => {
    it('groups presences by their cursor line position', () => {
      const content = 'Line 0\nLine 1\nLine 2'
      // Line 0: offset 0-6, Line 1: offset 7-13, Line 2: offset 14-20

      const p1 = updateCursor(createUserPresence('u1', 'Alice', 'human'), 0, 2) // Line 0
      const p2 = updateCursor(createUserPresence('u2', 'Bob', 'human'), 0, 8) // Line 1
      const p3 = updateCursor(createUserPresence('u3', 'Charlie', 'human'), 0, 15) // Line 2

      const grouped = groupPresencesByLine([p1, p2, p3], content)
      expect(grouped.get(0)).toHaveLength(1)
      expect(grouped.get(0)![0]!.name).toBe('Alice')
      expect(grouped.get(1)).toHaveLength(1)
      expect(grouped.get(1)![0]!.name).toBe('Bob')
      expect(grouped.get(2)).toHaveLength(1)
      expect(grouped.get(2)![0]!.name).toBe('Charlie')
    })

    it('groups multiple presences on same line', () => {
      const content = 'Line 0\nLine 1'
      const p1 = updateCursor(createUserPresence('u1', 'Alice', 'human'), 0, 2) // Line 0
      const p2 = updateCursor(createUserPresence('u2', 'Bob', 'human'), 0, 4) // Line 0

      const grouped = groupPresencesByLine([p1, p2], content)
      expect(grouped.get(0)).toHaveLength(2)
    })

    it('ignores presences without cursors', () => {
      const content = 'Line 0'
      const p1 = createUserPresence('u1', 'Alice', 'human') // no cursor

      const grouped = groupPresencesByLine([p1], content)
      expect(grouped.size).toBe(0)
    })
  })
})
