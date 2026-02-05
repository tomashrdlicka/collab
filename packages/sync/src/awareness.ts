import { PRESENCE_COLORS } from '@collab/shared'
import type { UserPresence, UserType } from '@collab/shared'

/**
 * Generate a color for a user based on their ID
 */
export function getUserColor(userId: string): string {
  // Hash the user ID to get a consistent color index
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    const char = userId.charCodeAt(i)
    hash = ((hash << 5) - hash + char) | 0
  }
  const index = Math.abs(hash) % PRESENCE_COLORS.length
  return PRESENCE_COLORS[index]!
}

/**
 * Create a user presence object
 */
export function createUserPresence(
  id: string,
  name: string,
  type: UserType,
  agentName?: string
): UserPresence {
  const presence: UserPresence = {
    id,
    name,
    color: getUserColor(id),
    type,
    cursor: null,
  }
  if (agentName !== undefined) {
    presence.agentName = agentName
  }
  return presence
}

/**
 * Update cursor position in a presence object
 */
export function updateCursor(
  presence: UserPresence,
  anchor: number,
  head: number
): UserPresence {
  return {
    ...presence,
    cursor: { anchor, head },
  }
}

/**
 * Clear cursor from a presence object
 */
export function clearCursor(presence: UserPresence): UserPresence {
  return {
    ...presence,
    cursor: null,
  }
}

/**
 * Check if a cursor position is within a range
 */
export function isCursorInRange(
  cursor: { anchor: number; head: number },
  start: number,
  end: number
): boolean {
  const cursorStart = Math.min(cursor.anchor, cursor.head)
  const cursorEnd = Math.max(cursor.anchor, cursor.head)
  return cursorStart < end && cursorEnd > start
}

/**
 * Get the cursor position as a single point (head)
 */
export function getCursorPosition(cursor: { anchor: number; head: number }): number {
  return cursor.head
}

/**
 * Check if a cursor represents a selection (not just a point)
 */
export function isSelection(cursor: { anchor: number; head: number }): boolean {
  return cursor.anchor !== cursor.head
}

/**
 * Get the selection range (start, end) from a cursor
 */
export function getSelectionRange(cursor: { anchor: number; head: number }): {
  start: number
  end: number
} {
  return {
    start: Math.min(cursor.anchor, cursor.head),
    end: Math.max(cursor.anchor, cursor.head),
  }
}

/**
 * Format a presence for display
 */
export function formatPresenceLabel(presence: UserPresence): string {
  if (presence.type === 'agent' && presence.agentName) {
    return presence.agentName
  }
  return presence.name
}

/**
 * Sort presences by type (humans first, then agents)
 */
export function sortPresences(presences: UserPresence[]): UserPresence[] {
  return [...presences].sort((a, b) => {
    if (a.type === 'human' && b.type !== 'human') return -1
    if (a.type !== 'human' && b.type === 'human') return 1
    return a.name.localeCompare(b.name)
  })
}

/**
 * Filter presences to only those with active cursors
 */
export function getActivePresences(presences: UserPresence[]): UserPresence[] {
  return presences.filter((p) => p.cursor !== null)
}

/**
 * Group presences by line number
 */
export function groupPresencesByLine(
  presences: UserPresence[],
  content: string
): Map<number, UserPresence[]> {
  const lineMap = new Map<number, UserPresence[]>()
  const lines = content.split('\n')

  // Build a character offset to line number map
  let offset = 0
  const lineStarts: number[] = [0]
  for (const line of lines) {
    offset += line.length + 1 // +1 for newline
    lineStarts.push(offset)
  }

  // Function to get line number from character offset
  const getLineNumber = (charOffset: number): number => {
    for (let i = lineStarts.length - 1; i >= 0; i--) {
      if (charOffset >= lineStarts[i]!) {
        return i
      }
    }
    return 0
  }

  // Group presences by line
  for (const presence of presences) {
    if (presence.cursor) {
      const lineNumber = getLineNumber(presence.cursor.head)
      if (!lineMap.has(lineNumber)) {
        lineMap.set(lineNumber, [])
      }
      lineMap.get(lineNumber)!.push(presence)
    }
  }

  return lineMap
}
