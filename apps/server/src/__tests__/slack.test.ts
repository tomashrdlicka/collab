import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the database and ORM modules before imports
vi.mock('@collab/db', () => ({
  default: {},
}))

vi.mock('@collab/db/schema', () => ({
  workspaceIntegrations: { workspaceId: 'workspaceId', type: 'type', enabled: 'enabled' },
  workspaces: { id: 'id' },
  users: { id: 'id' },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a, b) => ({ type: 'eq', field: a, value: b })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', conditions: args })),
}))

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const {
  notifyDocumentChanges,
  notifyCommit,
  notifyCollaboratorJoined,
  notifyConflict,
} = await import('../services/slack')

// Helper to create mock database that returns Slack config then workspace
function createMockDb(slackConfig: object | null, workspace?: object | null) {
  const defaultWorkspace = {
    id: 'ws-1',
    name: 'Test Workspace',
    slug: 'test-workspace',
    githubRepo: 'owner/repo',
  }

  let callCount = 0
  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn(() => {
      callCount++
      if (callCount === 1) {
        // Slack config query
        return slackConfig
          ? [{ config: JSON.stringify(slackConfig), enabled: true }]
          : []
      }
      // Workspace query
      return workspace === null ? [] : [workspace ?? defaultWorkspace]
    }),
  } as unknown as any
}

describe('slack notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch.mockResolvedValue({ ok: true })
    process.env.NEXTAUTH_URL = 'http://localhost:3000'
  })

  describe('notifyDocumentChanges', () => {
    it('sends notification when slack is configured', async () => {
      const db = createMockDb({
        webhookUrl: 'https://hooks.slack.com/test',
        notifyAgentChanges: true,
        notifyHumanChanges: true,
      })

      await notifyDocumentChanges(db, 'ws-1', [
        {
          path: 'docs/readme.md',
          userName: 'Alice',
          userType: 'human',
          changeType: 'update',
          summary: 'Updated intro',
        },
      ])

      expect(mockFetch).toHaveBeenCalledOnce()
      expect(mockFetch).toHaveBeenCalledWith(
        'https://hooks.slack.com/test',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      )
    })

    it('does not send when no slack config exists', async () => {
      const db = createMockDb(null)
      await notifyDocumentChanges(db, 'ws-1', [
        { path: 'test.md', userName: 'Bob', userType: 'human', changeType: 'create' },
      ])
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('filters out agent changes when notifyAgentChanges is false', async () => {
      const db = createMockDb({
        webhookUrl: 'https://hooks.slack.com/test',
        notifyAgentChanges: false,
        notifyHumanChanges: true,
      })

      await notifyDocumentChanges(db, 'ws-1', [
        { path: 'test.md', userName: 'Bot', userType: 'agent', changeType: 'update' },
      ])

      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('filters out human changes when notifyHumanChanges is false', async () => {
      const db = createMockDb({
        webhookUrl: 'https://hooks.slack.com/test',
        notifyAgentChanges: true,
        notifyHumanChanges: false,
      })

      await notifyDocumentChanges(db, 'ws-1', [
        { path: 'test.md', userName: 'Alice', userType: 'human', changeType: 'update' },
      ])

      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('sends mixed changes when both types enabled', async () => {
      const db = createMockDb({
        webhookUrl: 'https://hooks.slack.com/test',
        notifyAgentChanges: true,
        notifyHumanChanges: true,
      })

      await notifyDocumentChanges(db, 'ws-1', [
        { path: 'test.md', userName: 'Alice', userType: 'human', changeType: 'create' },
        { path: 'api.md', userName: 'Bot', userType: 'agent', changeType: 'update' },
      ])

      expect(mockFetch).toHaveBeenCalledOnce()
      const body = JSON.parse(mockFetch.mock.calls[0]![1].body)
      expect(body.text).toContain('Test Workspace')
    })

    it('includes workspace name in message', async () => {
      const db = createMockDb({
        webhookUrl: 'https://hooks.slack.com/test',
        notifyAgentChanges: true,
        notifyHumanChanges: true,
      })

      await notifyDocumentChanges(db, 'ws-1', [
        { path: 'doc.md', userName: 'Alice', userType: 'human', changeType: 'update' },
      ])

      const body = JSON.parse(mockFetch.mock.calls[0]![1].body)
      expect(body.text).toContain('Test Workspace')
      expect(body.blocks).toBeDefined()
      expect(body.blocks.length).toBeGreaterThan(0)
    })
  })

  describe('notifyCommit', () => {
    it('sends commit notification when enabled', async () => {
      const db = createMockDb({
        webhookUrl: 'https://hooks.slack.com/test',
        notifyCommits: true,
      })

      await notifyCommit(db, 'ws-1', {
        sha: 'abc123def',
        message: 'docs: update readme',
        filesChanged: [
          { path: 'readme.md', additions: 5, deletions: 2 },
          { path: 'guide.md', additions: 10, deletions: 0 },
        ],
      })

      expect(mockFetch).toHaveBeenCalledOnce()
      const body = JSON.parse(mockFetch.mock.calls[0]![1].body)
      expect(body.text).toContain('Test Workspace')
    })

    it('does not send when notifyCommits is false', async () => {
      const db = createMockDb({
        webhookUrl: 'https://hooks.slack.com/test',
        notifyCommits: false,
      })

      await notifyCommit(db, 'ws-1', {
        sha: 'abc123',
        message: 'test',
        filesChanged: [],
      })

      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('does not send when no slack config', async () => {
      const db = createMockDb(null)
      await notifyCommit(db, 'ws-1', {
        sha: 'abc',
        message: 'test',
        filesChanged: [],
      })
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe('notifyCollaboratorJoined', () => {
    it('sends notification for new collaborator', async () => {
      const db = createMockDb({
        webhookUrl: 'https://hooks.slack.com/test',
        notifyCollaborators: true,
      })

      await notifyCollaboratorJoined(db, 'ws-1', {
        name: 'Alice',
        avatarUrl: 'https://example.com/avatar.png',
      })

      expect(mockFetch).toHaveBeenCalledOnce()
      const body = JSON.parse(mockFetch.mock.calls[0]![1].body)
      expect(body.text).toContain('Alice')
      expect(body.text).toContain('Test Workspace')
    })

    it('does not send when notifyCollaborators is false', async () => {
      const db = createMockDb({
        webhookUrl: 'https://hooks.slack.com/test',
        notifyCollaborators: false,
      })

      await notifyCollaboratorJoined(db, 'ws-1', { name: 'Bob' })
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe('notifyConflict', () => {
    it('sends conflict notification when enabled', async () => {
      const db = createMockDb({
        webhookUrl: 'https://hooks.slack.com/test',
        notifyConflicts: true,
      })

      await notifyConflict(db, 'ws-1', {
        documentPath: 'readme.md',
        lineNumber: 42,
        users: ['Alice', 'Bob'],
      })

      expect(mockFetch).toHaveBeenCalledOnce()
      const body = JSON.parse(mockFetch.mock.calls[0]![1].body)
      expect(body.text).toContain('Conflict')
    })

    it('does not send when notifyConflicts is false', async () => {
      const db = createMockDb({
        webhookUrl: 'https://hooks.slack.com/test',
        notifyConflicts: false,
      })

      await notifyConflict(db, 'ws-1', {
        documentPath: 'test.md',
        lineNumber: 1,
        users: ['Alice'],
      })

      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('does not send when no slack config', async () => {
      const db = createMockDb(null)
      await notifyConflict(db, 'ws-1', {
        documentPath: 'test.md',
        lineNumber: 1,
        users: ['Alice'],
      })
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })
})
