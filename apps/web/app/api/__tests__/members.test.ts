import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  mockSession,
  mockSessionOther,
  mockWorkspace,
  mockMembership,
  mockUser,
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

// --- GET /api/workspaces/[id]/members ---

describe('GET /api/workspaces/[id]/members', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDbInstance.reset()
  })

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const { GET } = await import('../workspaces/[id]/members/route')
    const request = new Request('http://localhost/api/workspaces/ws-1/members')
    const response = await GET(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error.code).toBe('UNAUTHORIZED')
  })

  it('returns 404 for non-existent workspace', async () => {
    mockGetServerSession.mockResolvedValue(mockSession)
    mockDbInstance.addChain([])

    const { GET } = await import('../workspaces/[id]/members/route')
    const request = new Request('http://localhost/api/workspaces/ws-1/members')
    const response = await GET(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.error.code).toBe('WORKSPACE_NOT_FOUND')
  })

  it('returns 403 for non-member', async () => {
    mockGetServerSession.mockResolvedValue(mockSessionOther)
    mockDbInstance.addChain([mockWorkspace])
    mockDbInstance.addChain([])

    const { GET } = await import('../workspaces/[id]/members/route')
    const request = new Request('http://localhost/api/workspaces/ws-1/members')
    const response = await GET(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.error.code).toBe('FORBIDDEN')
  })

  it('returns members list for workspace owner', async () => {
    const mockMembers = [
      { userId: 'user-1', role: 'owner', joinedAt: '2024-01-15T12:00:00.000Z', githubUsername: 'test-user', githubAvatarUrl: null },
      { userId: 'user-2', role: 'editor', joinedAt: '2024-01-15T12:00:00.000Z', githubUsername: 'other-user', githubAvatarUrl: null },
    ]
    mockGetServerSession.mockResolvedValue(mockSession)
    mockDbInstance.addChain([mockWorkspace])
    mockDbInstance.addChain(mockMembers)

    const { GET } = await import('../workspaces/[id]/members/route')
    const request = new Request('http://localhost/api/workspaces/ws-1/members')
    const response = await GET(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.data).toEqual(mockMembers)
    expect(data.data).toHaveLength(2)
  })

  it('returns members list for a member', async () => {
    mockGetServerSession.mockResolvedValue(mockSessionOther)
    mockDbInstance.addChain([mockWorkspace])
    mockDbInstance.addChain([mockMembership])
    mockDbInstance.addChain([])

    const { GET } = await import('../workspaces/[id]/members/route')
    const request = new Request('http://localhost/api/workspaces/ws-1/members')
    const response = await GET(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.data).toEqual([])
  })
})

// --- POST /api/workspaces/[id]/members ---

describe('POST /api/workspaces/[id]/members', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDbInstance.reset()
  })

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const { POST } = await import('../workspaces/[id]/members/route')
    const request = jsonRequest('http://localhost/api/workspaces/ws-1/members', 'POST', {
      githubUsername: 'other-user',
    })
    const response = await POST(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error.code).toBe('UNAUTHORIZED')
  })

  it('returns 404 for non-existent workspace', async () => {
    mockGetServerSession.mockResolvedValue(mockSession)
    mockDbInstance.addChain([])

    const { POST } = await import('../workspaces/[id]/members/route')
    const request = jsonRequest('http://localhost/api/workspaces/ws-1/members', 'POST', {
      githubUsername: 'other-user',
    })
    const response = await POST(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.error.code).toBe('WORKSPACE_NOT_FOUND')
  })

  it('returns 403 when non-owner tries to add member', async () => {
    mockGetServerSession.mockResolvedValue(mockSessionOther)
    mockDbInstance.addChain([mockWorkspace])

    const { POST } = await import('../workspaces/[id]/members/route')
    const request = jsonRequest('http://localhost/api/workspaces/ws-1/members', 'POST', {
      githubUsername: 'some-user',
    })
    const response = await POST(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.error.code).toBe('FORBIDDEN')
  })

  it('returns 400 for invalid request body', async () => {
    mockGetServerSession.mockResolvedValue(mockSession)
    mockDbInstance.addChain([mockWorkspace])

    const { POST } = await import('../workspaces/[id]/members/route')
    const request = jsonRequest('http://localhost/api/workspaces/ws-1/members', 'POST', {
      githubUsername: '', // empty - invalid
    })
    const response = await POST(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error.code).toBe('VALIDATION_ERROR')
  })

  it('returns 404 when user not found by GitHub username', async () => {
    mockGetServerSession.mockResolvedValue(mockSession)
    mockDbInstance.addChain([mockWorkspace])
    mockDbInstance.addChain([]) // User not found

    const { POST } = await import('../workspaces/[id]/members/route')
    const request = jsonRequest('http://localhost/api/workspaces/ws-1/members', 'POST', {
      githubUsername: 'nonexistent-user',
    })
    const response = await POST(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.error.code).toBe('USER_NOT_FOUND')
  })

  it('returns 409 when user is already a member', async () => {
    mockGetServerSession.mockResolvedValue(mockSession)
    mockDbInstance.addChain([mockWorkspace])
    mockDbInstance.addChain([mockUser]) // User found
    mockDbInstance.addChain([mockMembership]) // Already a member

    const { POST } = await import('../workspaces/[id]/members/route')
    const request = jsonRequest('http://localhost/api/workspaces/ws-1/members', 'POST', {
      githubUsername: 'other-user',
    })
    const response = await POST(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(409)
    expect(data.error.code).toBe('ALREADY_MEMBER')
  })

  it('adds a new member successfully', async () => {
    mockGetServerSession.mockResolvedValue(mockSession)
    mockDbInstance.addChain([mockWorkspace])
    mockDbInstance.addChain([mockUser]) // User found
    mockDbInstance.addChain([]) // Not already a member
    mockDbInstance.addChain(undefined) // Insert member

    const { POST } = await import('../workspaces/[id]/members/route')
    const request = jsonRequest('http://localhost/api/workspaces/ws-1/members', 'POST', {
      githubUsername: 'other-user',
      role: 'viewer',
    })
    const response = await POST(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(201)
    expect(data.data.userId).toBe('user-2')
    expect(data.data.role).toBe('viewer')
  })
})

// --- PATCH /api/workspaces/[id]/members/[userId] ---

describe('PATCH /api/workspaces/[id]/members/[userId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDbInstance.reset()
  })

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const { PATCH } = await import('../workspaces/[id]/members/[userId]/route')
    const request = jsonRequest('http://localhost/api/workspaces/ws-1/members/user-2', 'PATCH', {
      role: 'viewer',
    })
    const response = await PATCH(request, { params: { id: 'ws-1', userId: 'user-2' } })
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error.code).toBe('UNAUTHORIZED')
  })

  it('returns 404 for non-existent workspace', async () => {
    mockGetServerSession.mockResolvedValue(mockSession)
    mockDbInstance.addChain([])

    const { PATCH } = await import('../workspaces/[id]/members/[userId]/route')
    const request = jsonRequest('http://localhost/api/workspaces/ws-1/members/user-2', 'PATCH', {
      role: 'viewer',
    })
    const response = await PATCH(request, { params: { id: 'ws-1', userId: 'user-2' } })
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.error.code).toBe('WORKSPACE_NOT_FOUND')
  })

  it('returns 403 when non-owner tries to update role', async () => {
    mockGetServerSession.mockResolvedValue(mockSessionOther)
    mockDbInstance.addChain([mockWorkspace])

    const { PATCH } = await import('../workspaces/[id]/members/[userId]/route')
    const request = jsonRequest('http://localhost/api/workspaces/ws-1/members/user-2', 'PATCH', {
      role: 'viewer',
    })
    const response = await PATCH(request, { params: { id: 'ws-1', userId: 'user-2' } })
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.error.code).toBe('FORBIDDEN')
  })

  it('returns 403 when trying to change owner role', async () => {
    mockGetServerSession.mockResolvedValue(mockSession)
    mockDbInstance.addChain([mockWorkspace])

    const { PATCH } = await import('../workspaces/[id]/members/[userId]/route')
    const request = jsonRequest('http://localhost/api/workspaces/ws-1/members/user-1', 'PATCH', {
      role: 'editor',
    })
    const response = await PATCH(request, { params: { id: 'ws-1', userId: 'user-1' } })
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.error.code).toBe('FORBIDDEN')
    expect(data.error.message).toContain('owner')
  })

  it('returns 400 for invalid role', async () => {
    mockGetServerSession.mockResolvedValue(mockSession)
    mockDbInstance.addChain([mockWorkspace])

    const { PATCH } = await import('../workspaces/[id]/members/[userId]/route')
    const request = jsonRequest('http://localhost/api/workspaces/ws-1/members/user-2', 'PATCH', {
      role: 'admin', // Not a valid role
    })
    const response = await PATCH(request, { params: { id: 'ws-1', userId: 'user-2' } })
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error.code).toBe('VALIDATION_ERROR')
  })

  it('updates member role successfully', async () => {
    const updatedMember = { ...mockMembership, role: 'viewer' }
    mockGetServerSession.mockResolvedValue(mockSession)
    mockDbInstance.addChain([mockWorkspace])
    mockDbInstance.addChain([updatedMember]) // Update returning

    const { PATCH } = await import('../workspaces/[id]/members/[userId]/route')
    const request = jsonRequest('http://localhost/api/workspaces/ws-1/members/user-2', 'PATCH', {
      role: 'viewer',
    })
    const response = await PATCH(request, { params: { id: 'ws-1', userId: 'user-2' } })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.data.role).toBe('viewer')
  })

  it('returns 404 when member not found during update', async () => {
    mockGetServerSession.mockResolvedValue(mockSession)
    mockDbInstance.addChain([mockWorkspace])
    mockDbInstance.addChain([]) // No result from update

    const { PATCH } = await import('../workspaces/[id]/members/[userId]/route')
    const request = jsonRequest('http://localhost/api/workspaces/ws-1/members/user-999', 'PATCH', {
      role: 'viewer',
    })
    const response = await PATCH(request, { params: { id: 'ws-1', userId: 'user-999' } })
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.error.code).toBe('NOT_FOUND')
  })
})

// --- DELETE /api/workspaces/[id]/members/[userId] ---

describe('DELETE /api/workspaces/[id]/members/[userId]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDbInstance.reset()
  })

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const { DELETE } = await import('../workspaces/[id]/members/[userId]/route')
    const request = new Request('http://localhost/api/workspaces/ws-1/members/user-2', { method: 'DELETE' })
    const response = await DELETE(request, { params: { id: 'ws-1', userId: 'user-2' } })
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error.code).toBe('UNAUTHORIZED')
  })

  it('returns 404 for non-existent workspace', async () => {
    mockGetServerSession.mockResolvedValue(mockSession)
    mockDbInstance.addChain([])

    const { DELETE } = await import('../workspaces/[id]/members/[userId]/route')
    const request = new Request('http://localhost/api/workspaces/ws-1/members/user-2', { method: 'DELETE' })
    const response = await DELETE(request, { params: { id: 'ws-1', userId: 'user-2' } })
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.error.code).toBe('WORKSPACE_NOT_FOUND')
  })

  it('returns 403 when non-owner tries to remove member', async () => {
    mockGetServerSession.mockResolvedValue(mockSessionOther)
    mockDbInstance.addChain([mockWorkspace])

    const { DELETE } = await import('../workspaces/[id]/members/[userId]/route')
    const request = new Request('http://localhost/api/workspaces/ws-1/members/user-2', { method: 'DELETE' })
    const response = await DELETE(request, { params: { id: 'ws-1', userId: 'user-2' } })
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.error.code).toBe('FORBIDDEN')
  })

  it('returns 403 when owner tries to remove themselves', async () => {
    mockGetServerSession.mockResolvedValue(mockSession)
    mockDbInstance.addChain([mockWorkspace])

    const { DELETE } = await import('../workspaces/[id]/members/[userId]/route')
    const request = new Request('http://localhost/api/workspaces/ws-1/members/user-1', { method: 'DELETE' })
    const response = await DELETE(request, { params: { id: 'ws-1', userId: 'user-1' } })
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.error.code).toBe('FORBIDDEN')
    expect(data.error.message).toContain('yourself')
  })

  it('removes member successfully', async () => {
    mockGetServerSession.mockResolvedValue(mockSession)
    mockDbInstance.addChain([mockWorkspace])
    mockDbInstance.addChain(undefined) // Delete operation

    const { DELETE } = await import('../workspaces/[id]/members/[userId]/route')
    const request = new Request('http://localhost/api/workspaces/ws-1/members/user-2', { method: 'DELETE' })
    const response = await DELETE(request, { params: { id: 'ws-1', userId: 'user-2' } })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.data.success).toBe(true)
  })
})
