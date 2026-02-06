import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  mockSession,
  mockSessionOther,
  mockWorkspace,
  mockMembership,
  createMockDb,
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

// --- Mock changes data ---

const mockChange = {
  id: 'change-1',
  documentId: 'doc-1',
  userId: 'user-1',
  userType: 'human',
  agentName: null,
  changeType: 'update',
  sectionsAffected: ['Introduction'],
  summary: 'Updated intro section',
  diffPreview: '+ new line',
  committed: false,
  commitSha: null,
  createdAt: new Date().toISOString(),
  documentPath: 'readme.md',
  userName: 'test-user',
  userAvatar: null,
}

// --- GET /api/workspaces/[id]/changes ---

describe('GET /api/workspaces/[id]/changes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDbInstance.reset()
  })

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const { GET } = await import('../workspaces/[id]/changes/route')
    const request = new Request('http://localhost/api/workspaces/ws-1/changes')
    const response = await GET(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error.code).toBe('UNAUTHORIZED')
  })

  it('returns 404 for non-existent workspace', async () => {
    mockGetServerSession.mockResolvedValue(mockSession)
    mockDbInstance.addChain([])

    const { GET } = await import('../workspaces/[id]/changes/route')
    const request = new Request('http://localhost/api/workspaces/ws-1/changes')
    const response = await GET(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.error.code).toBe('WORKSPACE_NOT_FOUND')
  })

  it('returns 403 for non-member', async () => {
    mockGetServerSession.mockResolvedValue(mockSessionOther)
    mockDbInstance.addChain([mockWorkspace])
    mockDbInstance.addChain([])

    const { GET } = await import('../workspaces/[id]/changes/route')
    const request = new Request('http://localhost/api/workspaces/ws-1/changes')
    const response = await GET(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.error.code).toBe('FORBIDDEN')
  })

  it('returns paginated changes for workspace owner', async () => {
    mockGetServerSession.mockResolvedValue(mockSession)
    mockDbInstance.addChain([mockWorkspace])
    mockDbInstance.addChain([mockChange])

    const { GET } = await import('../workspaces/[id]/changes/route')
    const request = new Request('http://localhost/api/workspaces/ws-1/changes?limit=10&offset=0')
    const response = await GET(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.data).toEqual([mockChange])
  })

  it('uses default pagination when no params provided', async () => {
    mockGetServerSession.mockResolvedValue(mockSession)
    mockDbInstance.addChain([mockWorkspace])
    mockDbInstance.addChain([])

    const { GET } = await import('../workspaces/[id]/changes/route')
    const request = new Request('http://localhost/api/workspaces/ws-1/changes')
    const response = await GET(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.data).toEqual([])
  })

  it('returns changes for workspace member', async () => {
    mockGetServerSession.mockResolvedValue(mockSessionOther)
    mockDbInstance.addChain([mockWorkspace])
    mockDbInstance.addChain([mockMembership])
    mockDbInstance.addChain([mockChange])

    const { GET } = await import('../workspaces/[id]/changes/route')
    const request = new Request('http://localhost/api/workspaces/ws-1/changes')
    const response = await GET(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.data).toEqual([mockChange])
  })
})

// --- GET /api/workspaces/[id]/changes/uncommitted ---

describe('GET /api/workspaces/[id]/changes/uncommitted', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDbInstance.reset()
  })

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const { GET } = await import('../workspaces/[id]/changes/uncommitted/route')
    const request = new Request('http://localhost/api/workspaces/ws-1/changes/uncommitted')
    const response = await GET(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error.code).toBe('UNAUTHORIZED')
  })

  it('returns 404 for non-existent workspace', async () => {
    mockGetServerSession.mockResolvedValue(mockSession)
    mockDbInstance.addChain([])

    const { GET } = await import('../workspaces/[id]/changes/uncommitted/route')
    const request = new Request('http://localhost/api/workspaces/ws-1/changes/uncommitted')
    const response = await GET(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.error.code).toBe('WORKSPACE_NOT_FOUND')
  })

  it('returns 403 for non-member', async () => {
    mockGetServerSession.mockResolvedValue(mockSessionOther)
    mockDbInstance.addChain([mockWorkspace])
    mockDbInstance.addChain([])

    const { GET } = await import('../workspaces/[id]/changes/uncommitted/route')
    const request = new Request('http://localhost/api/workspaces/ws-1/changes/uncommitted')
    const response = await GET(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.error.code).toBe('FORBIDDEN')
  })

  it('returns uncommitted changes for owner', async () => {
    const uncommittedChange = { ...mockChange, committed: false, commitSha: null }
    mockGetServerSession.mockResolvedValue(mockSession)
    mockDbInstance.addChain([mockWorkspace])
    mockDbInstance.addChain([uncommittedChange])

    const { GET } = await import('../workspaces/[id]/changes/uncommitted/route')
    const request = new Request('http://localhost/api/workspaces/ws-1/changes/uncommitted')
    const response = await GET(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.data).toEqual([uncommittedChange])
  })

  it('returns empty array when no uncommitted changes', async () => {
    mockGetServerSession.mockResolvedValue(mockSession)
    mockDbInstance.addChain([mockWorkspace])
    mockDbInstance.addChain([])

    const { GET } = await import('../workspaces/[id]/changes/uncommitted/route')
    const request = new Request('http://localhost/api/workspaces/ws-1/changes/uncommitted')
    const response = await GET(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.data).toEqual([])
  })
})
