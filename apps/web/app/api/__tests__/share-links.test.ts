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

vi.mock('@/lib/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/utils')>()
  return {
    ...actual,
    generateShareCode: () => 'testcode',
  }
})

// --- Mock data ---

const mockShareLink = {
  id: 'link-1',
  workspaceId: 'ws-1',
  code: 'abc12345',
  permission: 'editor',
  requireGithub: true,
  expiresAt: null,
  maxUses: null,
  useCount: 0,
  createdBy: 'user-1',
  disabledAt: null,
  createdAt: '2024-01-15T12:00:00.000Z',
}

// --- GET /api/workspaces/[id]/share-links ---

describe('GET /api/workspaces/[id]/share-links', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDbInstance.reset()
  })

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const { GET } = await import('../workspaces/[id]/share-links/route')
    const request = new Request('http://localhost/api/workspaces/ws-1/share-links')
    const response = await GET(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error.code).toBe('UNAUTHORIZED')
  })

  it('returns 404 for non-existent workspace', async () => {
    mockGetServerSession.mockResolvedValue(mockSession)
    mockDbInstance.addChain([])

    const { GET } = await import('../workspaces/[id]/share-links/route')
    const request = new Request('http://localhost/api/workspaces/ws-1/share-links')
    const response = await GET(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.error.code).toBe('WORKSPACE_NOT_FOUND')
  })

  it('returns 403 for viewer role', async () => {
    const viewerMembership = { ...mockMembership, role: 'viewer' }
    mockGetServerSession.mockResolvedValue(mockSessionOther)
    mockDbInstance.addChain([mockWorkspace])
    mockDbInstance.addChain([viewerMembership])

    const { GET } = await import('../workspaces/[id]/share-links/route')
    const request = new Request('http://localhost/api/workspaces/ws-1/share-links')
    const response = await GET(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.error.code).toBe('FORBIDDEN')
  })

  it('returns share links for owner', async () => {
    mockGetServerSession.mockResolvedValue(mockSession)
    mockDbInstance.addChain([mockWorkspace])
    mockDbInstance.addChain([mockShareLink])

    const { GET } = await import('../workspaces/[id]/share-links/route')
    const request = new Request('http://localhost/api/workspaces/ws-1/share-links')
    const response = await GET(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.data).toEqual([mockShareLink])
  })

  it('returns share links for editor member', async () => {
    mockGetServerSession.mockResolvedValue(mockSessionOther)
    mockDbInstance.addChain([mockWorkspace])
    mockDbInstance.addChain([mockMembership]) // editor role
    mockDbInstance.addChain([mockShareLink])

    const { GET } = await import('../workspaces/[id]/share-links/route')
    const request = new Request('http://localhost/api/workspaces/ws-1/share-links')
    const response = await GET(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.data).toEqual([mockShareLink])
  })
})

// --- POST /api/workspaces/[id]/share-links ---

describe('POST /api/workspaces/[id]/share-links', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDbInstance.reset()
  })

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const { POST } = await import('../workspaces/[id]/share-links/route')
    const request = jsonRequest('http://localhost/api/workspaces/ws-1/share-links', 'POST', {})
    const response = await POST(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error.code).toBe('UNAUTHORIZED')
  })

  it('returns 404 for non-existent workspace', async () => {
    mockGetServerSession.mockResolvedValue(mockSession)
    mockDbInstance.addChain([])

    const { POST } = await import('../workspaces/[id]/share-links/route')
    const request = jsonRequest('http://localhost/api/workspaces/ws-1/share-links', 'POST', {})
    const response = await POST(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.error.code).toBe('WORKSPACE_NOT_FOUND')
  })

  it('returns 403 for viewer role', async () => {
    const viewerMembership = { ...mockMembership, role: 'viewer' }
    mockGetServerSession.mockResolvedValue(mockSessionOther)
    mockDbInstance.addChain([mockWorkspace])
    mockDbInstance.addChain([viewerMembership])

    const { POST } = await import('../workspaces/[id]/share-links/route')
    const request = jsonRequest('http://localhost/api/workspaces/ws-1/share-links', 'POST', {})
    const response = await POST(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.error.code).toBe('FORBIDDEN')
  })

  it('creates share link with defaults for owner', async () => {
    const newLink = { ...mockShareLink, code: 'testcode' }
    mockGetServerSession.mockResolvedValue(mockSession)
    mockDbInstance.addChain([mockWorkspace])
    mockDbInstance.addChain([newLink]) // Insert returning

    const { POST } = await import('../workspaces/[id]/share-links/route')
    const request = jsonRequest('http://localhost/api/workspaces/ws-1/share-links', 'POST', {})
    const response = await POST(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(201)
    expect(data.data.code).toBe('testcode')
  })

  it('creates share link with custom permission and maxUses', async () => {
    const newLink = { ...mockShareLink, code: 'testcode', permission: 'viewer', maxUses: 5 }
    mockGetServerSession.mockResolvedValue(mockSession)
    mockDbInstance.addChain([mockWorkspace])
    mockDbInstance.addChain([newLink])

    const { POST } = await import('../workspaces/[id]/share-links/route')
    const request = jsonRequest('http://localhost/api/workspaces/ws-1/share-links', 'POST', {
      permission: 'viewer',
      maxUses: 5,
    })
    const response = await POST(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(201)
    expect(data.data.permission).toBe('viewer')
    expect(data.data.maxUses).toBe(5)
  })

  it('creates share link for editor member', async () => {
    mockGetServerSession.mockResolvedValue(mockSessionOther)
    mockDbInstance.addChain([mockWorkspace])
    mockDbInstance.addChain([mockMembership]) // editor
    mockDbInstance.addChain([{ ...mockShareLink, code: 'testcode' }])

    const { POST } = await import('../workspaces/[id]/share-links/route')
    const request = jsonRequest('http://localhost/api/workspaces/ws-1/share-links', 'POST', {})
    const response = await POST(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(201)
  })
})

// --- DELETE /api/workspaces/[id]/share-links/[linkId] ---

describe('DELETE /api/workspaces/[id]/share-links/[linkId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDbInstance.reset()
  })

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const { DELETE } = await import('../workspaces/[id]/share-links/[linkId]/route')
    const request = new Request('http://localhost/api/workspaces/ws-1/share-links/link-1', { method: 'DELETE' })
    const response = await DELETE(request, { params: { id: 'ws-1', linkId: 'link-1' } })
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error.code).toBe('UNAUTHORIZED')
  })

  it('returns 404 for non-existent share link', async () => {
    mockGetServerSession.mockResolvedValue(mockSession)
    mockDbInstance.addChain([]) // Link not found

    const { DELETE } = await import('../workspaces/[id]/share-links/[linkId]/route')
    const request = new Request('http://localhost/api/workspaces/ws-1/share-links/link-99', { method: 'DELETE' })
    const response = await DELETE(request, { params: { id: 'ws-1', linkId: 'link-99' } })
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.error.code).toBe('NOT_FOUND')
  })

  it('returns 403 when neither creator nor owner', async () => {
    const linkByOther = { ...mockShareLink, createdBy: 'user-3' }
    mockGetServerSession.mockResolvedValue(mockSessionOther)
    mockDbInstance.addChain([linkByOther]) // Link found
    mockDbInstance.addChain([mockWorkspace]) // Workspace check

    const { DELETE } = await import('../workspaces/[id]/share-links/[linkId]/route')
    const request = new Request('http://localhost/api/workspaces/ws-1/share-links/link-1', { method: 'DELETE' })
    const response = await DELETE(request, { params: { id: 'ws-1', linkId: 'link-1' } })
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.error.code).toBe('FORBIDDEN')
  })

  it('disables share link for workspace owner', async () => {
    mockGetServerSession.mockResolvedValue(mockSession)
    mockDbInstance.addChain([mockShareLink]) // Link found
    mockDbInstance.addChain([mockWorkspace]) // Workspace check
    mockDbInstance.addChain(undefined) // Update (soft delete)

    const { DELETE } = await import('../workspaces/[id]/share-links/[linkId]/route')
    const request = new Request('http://localhost/api/workspaces/ws-1/share-links/link-1', { method: 'DELETE' })
    const response = await DELETE(request, { params: { id: 'ws-1', linkId: 'link-1' } })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.data.success).toBe(true)
  })

  it('disables share link for the link creator', async () => {
    const linkByUser2 = { ...mockShareLink, createdBy: 'user-2' }
    mockGetServerSession.mockResolvedValue(mockSessionOther)
    mockDbInstance.addChain([linkByUser2])
    mockDbInstance.addChain([mockWorkspace])
    mockDbInstance.addChain(undefined)

    const { DELETE } = await import('../workspaces/[id]/share-links/[linkId]/route')
    const request = new Request('http://localhost/api/workspaces/ws-1/share-links/link-1', { method: 'DELETE' })
    const response = await DELETE(request, { params: { id: 'ws-1', linkId: 'link-1' } })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.data.success).toBe(true)
  })
})
