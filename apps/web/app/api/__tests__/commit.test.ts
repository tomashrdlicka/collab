import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  mockSession,
  mockSessionOther,
  mockWorkspace,
  mockMembership,
  createMockDb,
  jsonRequest,
} from './helpers'

// --- Mocks ---

const mockGetServerSession = vi.fn()
vi.mock('next-auth', () => ({
  getServerSession: (...args: unknown[]) => mockGetServerSession(...args),
}))

vi.mock('@/lib/auth', () => ({
  authOptions: {},
}))

const mockDbInstance = createMockDb()
vi.mock('@/lib/db', () => ({
  getDatabase: () => mockDbInstance.db,
}))

const mockCommitToGitHub = vi.fn()
vi.mock('@/lib/github', () => ({
  commitToGitHub: (...args: unknown[]) => mockCommitToGitHub(...args),
}))

vi.mock('@collab/sync', () => ({
  getDocContent: () => '# Hello World',
  decodeDocState: (buf: Uint8Array) => ({}),
}))

// --- Mock data ---

const mockChange = {
  id: 'change-1',
  documentId: 'doc-1',
  workspaceId: 'ws-1',
  userId: 'user-1',
  userType: 'human',
  agentName: null,
  changeType: 'update',
  sectionsAffected: [],
  summary: 'Updated content',
  diffPreview: '+ new line',
  committed: false,
  commitSha: null,
  createdAt: new Date(),
}

const mockDoc = {
  id: 'doc-1',
  workspaceId: 'ws-1',
  path: 'readme.md',
  yjsState: Buffer.from('test'),
  contentHash: 'hash',
  lastModifiedBy: 'user-1',
  lastModifiedAt: new Date(),
  createdAt: new Date(),
}

// --- POST /api/workspaces/[id]/commit ---

describe('POST /api/workspaces/[id]/commit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDbInstance.reset()
    mockCommitToGitHub.mockReset()
  })

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const { POST } = await import('../workspaces/[id]/commit/route')
    const request = jsonRequest('http://localhost/api/workspaces/ws-1/commit', 'POST', {})
    const response = await POST(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error.code).toBe('UNAUTHORIZED')
  })

  it('returns 404 for non-existent workspace', async () => {
    mockGetServerSession.mockResolvedValue(mockSession)
    mockDbInstance.addChain([])

    const { POST } = await import('../workspaces/[id]/commit/route')
    const request = jsonRequest('http://localhost/api/workspaces/ws-1/commit', 'POST', {})
    const response = await POST(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.error.code).toBe('WORKSPACE_NOT_FOUND')
  })

  it('returns 403 for viewer role', async () => {
    const viewerMembership = { ...mockMembership, role: 'viewer' }
    mockGetServerSession.mockResolvedValue(mockSessionOther)
    mockDbInstance.addChain([mockWorkspace]) // Workspace lookup
    mockDbInstance.addChain([viewerMembership]) // Membership check

    const { POST } = await import('../workspaces/[id]/commit/route')
    const request = jsonRequest('http://localhost/api/workspaces/ws-1/commit', 'POST', {})
    const response = await POST(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.error.code).toBe('FORBIDDEN')
  })

  it('returns 403 for non-member', async () => {
    mockGetServerSession.mockResolvedValue(mockSessionOther)
    mockDbInstance.addChain([mockWorkspace])
    mockDbInstance.addChain([]) // No membership

    const { POST } = await import('../workspaces/[id]/commit/route')
    const request = jsonRequest('http://localhost/api/workspaces/ws-1/commit', 'POST', {})
    const response = await POST(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.error.code).toBe('FORBIDDEN')
  })

  it('returns 400 when no uncommitted changes', async () => {
    mockGetServerSession.mockResolvedValue(mockSession)
    mockDbInstance.addChain([mockWorkspace]) // Workspace lookup
    mockDbInstance.addChain([]) // No uncommitted changes

    const { POST } = await import('../workspaces/[id]/commit/route')
    const request = jsonRequest('http://localhost/api/workspaces/ws-1/commit', 'POST', {})
    const response = await POST(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error.code).toBe('NO_CHANGES')
  })

  it('commits changes successfully with auto-generated message', async () => {
    mockGetServerSession.mockResolvedValue(mockSession)
    mockDbInstance.addChain([mockWorkspace]) // Workspace lookup
    mockDbInstance.addChain([mockChange]) // Uncommitted changes
    mockDbInstance.addChain([mockDoc]) // Documents query
    mockCommitToGitHub.mockResolvedValue({
      sha: 'abc123def',
      url: 'https://github.com/owner/repo/commit/abc123def',
    })
    mockDbInstance.addChain(undefined) // Mark changes committed
    mockDbInstance.addChain(undefined) // Update workspace

    const { POST } = await import('../workspaces/[id]/commit/route')
    const request = jsonRequest('http://localhost/api/workspaces/ws-1/commit', 'POST', {})
    const response = await POST(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.data.sha).toBe('abc123def')
    expect(data.data.url).toBe('https://github.com/owner/repo/commit/abc123def')
    expect(data.data.message).toContain('docs:')
  })

  it('commits with custom message', async () => {
    mockGetServerSession.mockResolvedValue(mockSession)
    mockDbInstance.addChain([mockWorkspace])
    mockDbInstance.addChain([mockChange])
    mockDbInstance.addChain([mockDoc])
    mockCommitToGitHub.mockResolvedValue({ sha: 'abc123', url: 'https://github.com/owner/repo/commit/abc123' })
    mockDbInstance.addChain(undefined)
    mockDbInstance.addChain(undefined)

    const { POST } = await import('../workspaces/[id]/commit/route')
    const request = jsonRequest('http://localhost/api/workspaces/ws-1/commit', 'POST', {
      message: 'My custom commit message',
    })
    const response = await POST(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.data.message).toBe('My custom commit message')
  })

  it('returns 500 when GitHub commit fails', async () => {
    mockGetServerSession.mockResolvedValue(mockSession)
    mockDbInstance.addChain([mockWorkspace])
    mockDbInstance.addChain([mockChange])
    mockDbInstance.addChain([mockDoc])
    mockCommitToGitHub.mockRejectedValue(new Error('GitHub API error'))

    const { POST } = await import('../workspaces/[id]/commit/route')
    const request = jsonRequest('http://localhost/api/workspaces/ws-1/commit', 'POST', {})
    const response = await POST(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error.code).toBe('COMMIT_FAILED')
  })

  it('allows editor members to commit', async () => {
    mockGetServerSession.mockResolvedValue(mockSessionOther)
    mockDbInstance.addChain([mockWorkspace])
    mockDbInstance.addChain([mockMembership]) // editor role
    mockDbInstance.addChain([mockChange])
    mockDbInstance.addChain([mockDoc])
    mockCommitToGitHub.mockResolvedValue({ sha: 'abc', url: 'https://github.com/owner/repo/commit/abc' })
    mockDbInstance.addChain(undefined)
    mockDbInstance.addChain(undefined)

    const { POST } = await import('../workspaces/[id]/commit/route')
    const request = jsonRequest('http://localhost/api/workspaces/ws-1/commit', 'POST', {})
    const response = await POST(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.data.sha).toBe('abc')
  })
})
