import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the database and ORM modules before imports
vi.mock('@collab/db', () => ({
  default: {},
}))

vi.mock('@collab/db/schema', () => ({
  githubTokens: { userId: 'userId' },
  workspaces: { id: 'id', ownerId: 'ownerId' },
  documents: { id: 'id' },
  documentChanges: { workspaceId: 'workspaceId', committed: 'committed' },
  workspaceIntegrations: { workspaceId: 'workspaceId', type: 'type', enabled: 'enabled' },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a, b) => ({ type: 'eq', field: a, value: b })),
  and: vi.fn((...args: unknown[]) => ({ type: 'and', conditions: args })),
  sql: vi.fn(),
}))

vi.mock('@collab/shared', () => ({
  decryptToken: vi.fn(() => 'ghp_decrypted_mock_token'),
  DEFAULT_IDLE_MINUTES: 5,
  DEFAULT_MAX_MINUTES: 60,
  MAX_DAILY_COMMITS: 100,
}))

vi.mock('@collab/sync', () => ({
  getDocContent: vi.fn(() => '# Mocked content'),
  decodeDocState: vi.fn(() => ({})),
}))

// Mock fetch globally
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Now import the modules under test
const { getGitHubToken, commitToGitHub, listUserRepos } = await import('../services/github')

// Helper: creates a mock db that returns results in sequence
function createMockDb(queryResults: unknown[][]) {
  let callIdx = 0
  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn(() => queryResults[callIdx++] ?? []),
  } as unknown as any
}

const DEFAULT_WORKSPACE = {
  id: 'ws-1',
  name: 'Test Workspace',
  githubRepo: 'owner/repo',
  githubBranch: 'main',
  ownerId: 'user-1',
}

const DEFAULT_TOKEN = { encryptedToken: Buffer.from('encrypted') }

describe('github service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getGitHubToken', () => {
    it('returns decrypted token when found', async () => {
      const db = createMockDb([[DEFAULT_TOKEN]])
      const token = await getGitHubToken(db, 'user-1')
      expect(token).toBe('ghp_decrypted_mock_token')
    })

    it('returns null when no token record', async () => {
      const db = createMockDb([[]])
      const token = await getGitHubToken(db, 'user-1')
      expect(token).toBeNull()
    })
  })

  describe('commitToGitHub', () => {
    // commitToGitHub query order: 1) workspace, 2) token (via getGitHubToken)
    it('performs full commit flow with correct API calls', async () => {
      const db = createMockDb([
        [DEFAULT_WORKSPACE], // workspace query
        [DEFAULT_TOKEN],     // token query
      ])

      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ object: { sha: 'branch-sha-123' } }) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ sha: 'blob-sha-456' }) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ sha: 'tree-sha-789' }) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ sha: 'commit-sha-abc' }) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })

      const result = await commitToGitHub(db, 'ws-1', [
        { path: 'readme.md', content: '# Hello' },
      ], 'test commit')

      expect(result.sha).toBe('commit-sha-abc')
      expect(result.url).toBe('https://github.com/owner/repo/commit/commit-sha-abc')
      expect(mockFetch).toHaveBeenCalledTimes(5)

      // Verify API endpoints called
      expect(mockFetch.mock.calls[0]![0]).toContain('/repos/owner/repo/git/ref/heads/main')
      expect(mockFetch.mock.calls[1]![0]).toContain('/repos/owner/repo/git/blobs')
      expect(mockFetch.mock.calls[2]![0]).toContain('/repos/owner/repo/git/trees')
      expect(mockFetch.mock.calls[3]![0]).toContain('/repos/owner/repo/git/commits')
      expect(mockFetch.mock.calls[4]![0]).toContain('/repos/owner/repo/git/refs/heads/main')
    })

    it('throws when workspace not found', async () => {
      const db = createMockDb([[]]) // empty workspace result

      await expect(
        commitToGitHub(db, 'ws-missing', [{ path: 'test.md', content: 'test' }], 'msg')
      ).rejects.toThrow('Workspace not found')
    })

    it('throws when no github token', async () => {
      const db = createMockDb([
        [DEFAULT_WORKSPACE], // workspace found
        [],                  // no token
      ])

      await expect(
        commitToGitHub(db, 'ws-1', [{ path: 'test.md', content: 'test' }], 'msg')
      ).rejects.toThrow('No GitHub token found')
    })

    it('throws when branch SHA request fails', async () => {
      const db = createMockDb([
        [DEFAULT_WORKSPACE],
        [DEFAULT_TOKEN],
      ])

      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: () => Promise.resolve('Not Found'),
      })

      await expect(
        commitToGitHub(db, 'ws-1', [{ path: 'test.md', content: 'test' }], 'msg')
      ).rejects.toThrow('Failed to get branch')
    })

    it('strips leading slash from file paths', async () => {
      const db = createMockDb([
        [DEFAULT_WORKSPACE],
        [DEFAULT_TOKEN],
      ])

      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ object: { sha: 'sha1' } }) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ sha: 'blob1' }) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ sha: 'tree1' }) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ sha: 'commit1' }) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })

      await commitToGitHub(db, 'ws-1', [
        { path: '/docs/file.md', content: 'content' },
      ], 'test')

      const treeCall = mockFetch.mock.calls[2]!
      const treeBody = JSON.parse(treeCall[1].body)
      expect(treeBody.tree[0].path).toBe('docs/file.md')
    })

    it('sends base64-encoded blob content', async () => {
      const db = createMockDb([
        [DEFAULT_WORKSPACE],
        [DEFAULT_TOKEN],
      ])

      mockFetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ object: { sha: 'sha1' } }) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ sha: 'blob1' }) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ sha: 'tree1' }) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ sha: 'commit1' }) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })

      await commitToGitHub(db, 'ws-1', [
        { path: 'test.md', content: '# Hello' },
      ], 'test')

      const blobCall = mockFetch.mock.calls[1]!
      const blobBody = JSON.parse(blobCall[1].body)
      expect(blobBody.encoding).toBe('base64')
      expect(blobBody.content).toBe(Buffer.from('# Hello').toString('base64'))
    })
  })

  describe('listUserRepos', () => {
    // listUserRepos query order: 1) token (via getGitHubToken)
    it('returns list of repositories', async () => {
      const db = createMockDb([[DEFAULT_TOKEN]])

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([
          { name: 'repo1', full_name: 'user/repo1', description: 'A repo', private: false },
          { name: 'repo2', full_name: 'user/repo2', description: null, private: true },
        ]),
      })

      const repos = await listUserRepos(db, 'user-1')
      expect(repos).toHaveLength(2)
      expect(repos[0]!.full_name).toBe('user/repo1')
      expect(repos[1]!.private).toBe(true)
    })

    it('throws when no token found', async () => {
      const db = createMockDb([[]])
      await expect(listUserRepos(db, 'user-1')).rejects.toThrow('No GitHub token found')
    })

    it('throws when API request fails', async () => {
      const db = createMockDb([[DEFAULT_TOKEN]])

      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: () => Promise.resolve('Unauthorized'),
      })

      await expect(listUserRepos(db, 'user-1')).rejects.toThrow('Failed to list repos')
    })
  })
})
