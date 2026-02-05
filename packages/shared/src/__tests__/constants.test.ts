import { describe, it, expect } from 'vitest'
import {
  SYNC_DEBOUNCE_MS,
  RECONNECT_DELAY_MS,
  MAX_RECONNECT_DELAY_MS,
  RECONNECT_BACKOFF_MULTIPLIER,
  DEFAULT_IDLE_MINUTES,
  DEFAULT_MAX_MINUTES,
  MAX_DAILY_COMMITS,
  CONFLICT_WINDOW_MS,
  FILE_WATCH_DEBOUNCE_MS,
  FILE_WATCH_IGNORED,
  PRESENCE_COLORS,
  API_PATHS,
  WS_PATH,
  HEADING_PATTERN,
  FRONTMATTER_PATTERN,
  CONTEXT_MARKERS,
  ERROR_CODES,
} from '../constants'

describe('constants', () => {
  describe('sync settings', () => {
    it('has valid debounce values', () => {
      expect(SYNC_DEBOUNCE_MS).toBe(300)
      expect(RECONNECT_DELAY_MS).toBe(1000)
      expect(MAX_RECONNECT_DELAY_MS).toBe(30000)
      expect(RECONNECT_BACKOFF_MULTIPLIER).toBe(1.5)
    })

    it('max reconnect delay is greater than initial delay', () => {
      expect(MAX_RECONNECT_DELAY_MS).toBeGreaterThan(RECONNECT_DELAY_MS)
    })
  })

  describe('commit settings', () => {
    it('has valid commit values', () => {
      expect(DEFAULT_IDLE_MINUTES).toBe(5)
      expect(DEFAULT_MAX_MINUTES).toBe(60)
      expect(MAX_DAILY_COMMITS).toBe(100)
    })

    it('idle minutes is less than max minutes', () => {
      expect(DEFAULT_IDLE_MINUTES).toBeLessThan(DEFAULT_MAX_MINUTES)
    })
  })

  describe('conflict settings', () => {
    it('has valid conflict window', () => {
      expect(CONFLICT_WINDOW_MS).toBe(500)
      expect(CONFLICT_WINDOW_MS).toBeGreaterThan(0)
    })
  })

  describe('file watching', () => {
    it('has valid debounce', () => {
      expect(FILE_WATCH_DEBOUNCE_MS).toBe(300)
    })

    it('ignores standard directories', () => {
      expect(FILE_WATCH_IGNORED).toContain('**/node_modules/**')
      expect(FILE_WATCH_IGNORED).toContain('**/.git/**')
      expect(FILE_WATCH_IGNORED).toContain('**/dist/**')
      expect(FILE_WATCH_IGNORED).toContain('**/.next/**')
      expect(FILE_WATCH_IGNORED).toContain('**/coverage/**')
    })
  })

  describe('presence colors', () => {
    it('has 10 colors', () => {
      expect(PRESENCE_COLORS).toHaveLength(10)
    })

    it('all colors are valid hex strings', () => {
      for (const color of PRESENCE_COLORS) {
        expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/)
      }
    })

    it('all colors are unique', () => {
      const unique = new Set(PRESENCE_COLORS)
      expect(unique.size).toBe(PRESENCE_COLORS.length)
    })
  })

  describe('API_PATHS', () => {
    it('has static auth paths', () => {
      expect(API_PATHS.AUTH.SESSION).toBe('/api/auth/session')
      expect(API_PATHS.AUTH.GITHUB).toBe('/api/auth/github')
      expect(API_PATHS.AUTH.LOGOUT).toBe('/api/auth/logout')
    })

    it('has CLI paths', () => {
      expect(API_PATHS.CLI.AUTH_START).toBe('/api/cli/auth/start')
      expect(API_PATHS.CLI.AUTH_POLL).toBe('/api/cli/auth/poll')
    })

    it('has static workspace path', () => {
      expect(API_PATHS.WORKSPACES).toBe('/api/workspaces')
    })

    it('generates workspace paths correctly', () => {
      expect(API_PATHS.WORKSPACE('abc')).toBe('/api/workspaces/abc')
      expect(API_PATHS.MEMBERS('abc')).toBe('/api/workspaces/abc/members')
      expect(API_PATHS.MEMBER('abc', 'user1')).toBe('/api/workspaces/abc/members/user1')
      expect(API_PATHS.SHARE_LINKS('abc')).toBe('/api/workspaces/abc/share-links')
      expect(API_PATHS.DOCUMENTS('abc')).toBe('/api/workspaces/abc/documents')
      expect(API_PATHS.CHANGES('abc')).toBe('/api/workspaces/abc/changes')
      expect(API_PATHS.UNCOMMITTED('abc')).toBe('/api/workspaces/abc/changes/uncommitted')
      expect(API_PATHS.COMMIT('abc')).toBe('/api/workspaces/abc/commit')
    })

    it('encodes document path', () => {
      expect(API_PATHS.DOCUMENT('abc', 'docs/file.md')).toBe(
        '/api/workspaces/abc/documents/docs%2Ffile.md'
      )
    })

    it('generates join path', () => {
      expect(API_PATHS.JOIN('abc123')).toBe('/api/join/abc123')
    })
  })

  describe('WS_PATH', () => {
    it('has correct value', () => {
      expect(WS_PATH).toBe('/collab')
    })
  })

  describe('HEADING_PATTERN', () => {
    it('matches h1 headings', () => {
      const match = '# Title'.match(/^(#{1,6})\s+(.+)$/)
      expect(match).not.toBeNull()
      expect(match![1]).toBe('#')
      expect(match![2]).toBe('Title')
    })

    it('matches h6 headings', () => {
      const match = '###### Deep'.match(/^(#{1,6})\s+(.+)$/)
      expect(match).not.toBeNull()
      expect(match![1]).toBe('######')
      expect(match![2]).toBe('Deep')
    })

    it('does not match 7+ hashes', () => {
      const match = '####### Too Deep'.match(/^(#{1,6})\s+(.+)$/)
      expect(match).toBeNull()
    })

    it('requires space after hashes', () => {
      const match = '#NoSpace'.match(/^(#{1,6})\s+(.+)$/)
      expect(match).toBeNull()
    })

    it('matches multiple headings with global flag', () => {
      const text = '# One\nSome text\n## Two\n### Three'
      const matches = [...text.matchAll(HEADING_PATTERN)]
      expect(matches).toHaveLength(3)
    })
  })

  describe('FRONTMATTER_PATTERN', () => {
    it('matches valid frontmatter', () => {
      const content = '---\ntitle: Test\nauthor: Me\n---\n# Body'
      const match = content.match(FRONTMATTER_PATTERN)
      expect(match).not.toBeNull()
      expect(match![1]).toBe('title: Test\nauthor: Me')
    })

    it('does not match without closing delimiter', () => {
      const content = '---\ntitle: Test\n# Body'
      const match = content.match(FRONTMATTER_PATTERN)
      expect(match).toBeNull()
    })

    it('only matches at start of content', () => {
      const content = 'Some text\n---\ntitle: Test\n---'
      const match = content.match(FRONTMATTER_PATTERN)
      expect(match).toBeNull()
    })
  })

  describe('CONTEXT_MARKERS', () => {
    it('has all four marker types', () => {
      expect(CONTEXT_MARKERS.ALWAYS_INCLUDE).toBe('<!-- context: always -->')
      expect(CONTEXT_MARKERS.IF_RELEVANT).toBe('<!-- context: if-relevant -->')
      expect(CONTEXT_MARKERS.PRIORITY).toBe('<!-- context: priority -->')
      expect(CONTEXT_MARKERS.HUMAN_ONLY).toBe('<!-- context: human-only -->')
    })
  })

  describe('ERROR_CODES', () => {
    it('has auth error codes', () => {
      expect(ERROR_CODES.UNAUTHORIZED).toBe('UNAUTHORIZED')
      expect(ERROR_CODES.FORBIDDEN).toBe('FORBIDDEN')
      expect(ERROR_CODES.INVALID_TOKEN).toBe('INVALID_TOKEN')
      expect(ERROR_CODES.TOKEN_EXPIRED).toBe('TOKEN_EXPIRED')
    })

    it('has workspace error codes', () => {
      expect(ERROR_CODES.WORKSPACE_NOT_FOUND).toBe('WORKSPACE_NOT_FOUND')
      expect(ERROR_CODES.WORKSPACE_SLUG_TAKEN).toBe('WORKSPACE_SLUG_TAKEN')
      expect(ERROR_CODES.NOT_WORKSPACE_MEMBER).toBe('NOT_WORKSPACE_MEMBER')
      expect(ERROR_CODES.INSUFFICIENT_PERMISSIONS).toBe('INSUFFICIENT_PERMISSIONS')
    })

    it('has document error codes', () => {
      expect(ERROR_CODES.DOCUMENT_NOT_FOUND).toBe('DOCUMENT_NOT_FOUND')
      expect(ERROR_CODES.DOCUMENT_CONFLICT).toBe('DOCUMENT_CONFLICT')
    })

    it('has share link error codes', () => {
      expect(ERROR_CODES.SHARE_LINK_NOT_FOUND).toBe('SHARE_LINK_NOT_FOUND')
      expect(ERROR_CODES.SHARE_LINK_EXPIRED).toBe('SHARE_LINK_EXPIRED')
      expect(ERROR_CODES.SHARE_LINK_MAX_USES).toBe('SHARE_LINK_MAX_USES')
      expect(ERROR_CODES.SHARE_LINK_DISABLED).toBe('SHARE_LINK_DISABLED')
    })

    it('has github error codes', () => {
      expect(ERROR_CODES.GITHUB_API_ERROR).toBe('GITHUB_API_ERROR')
      expect(ERROR_CODES.GITHUB_REPO_NOT_FOUND).toBe('GITHUB_REPO_NOT_FOUND')
      expect(ERROR_CODES.GITHUB_PERMISSION_DENIED).toBe('GITHUB_PERMISSION_DENIED')
    })

    it('has rate limiting codes', () => {
      expect(ERROR_CODES.RATE_LIMIT_EXCEEDED).toBe('RATE_LIMIT_EXCEEDED')
      expect(ERROR_CODES.DAILY_COMMIT_LIMIT).toBe('DAILY_COMMIT_LIMIT')
    })

    it('has validation and server error codes', () => {
      expect(ERROR_CODES.VALIDATION_ERROR).toBe('VALIDATION_ERROR')
      expect(ERROR_CODES.INTERNAL_ERROR).toBe('INTERNAL_ERROR')
    })

    it('all codes are unique strings', () => {
      const values = Object.values(ERROR_CODES)
      const unique = new Set(values)
      expect(unique.size).toBe(values.length)
    })
  })
})
