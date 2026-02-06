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
    slugify: actual.slugify,
  }
})

// --- Tests ---

describe('GET /api/workspaces', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDbInstance.reset()
  })

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const { GET } = await import('../workspaces/route')
    const response = await GET()
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error.code).toBe('UNAUTHORIZED')
  })

  it('returns list of workspaces for authenticated user', async () => {
    mockGetServerSession.mockResolvedValue(mockSession)
    mockDbInstance.addChain([mockWorkspace])

    const { GET } = await import('../workspaces/route')
    const response = await GET()
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.data).toEqual([mockWorkspace])
  })

  it('returns empty array when user has no workspaces', async () => {
    mockGetServerSession.mockResolvedValue(mockSession)
    mockDbInstance.addChain([])

    const { GET } = await import('../workspaces/route')
    const response = await GET()
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.data).toEqual([])
  })
})

describe('POST /api/workspaces', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDbInstance.reset()
  })

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const { POST } = await import('../workspaces/route')
    const request = jsonRequest('http://localhost/api/workspaces', 'POST', {
      name: 'Test',
      githubRepo: 'owner/repo',
    })
    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error.code).toBe('UNAUTHORIZED')
  })

  it('returns 400 for invalid body', async () => {
    mockGetServerSession.mockResolvedValue(mockSession)

    const { POST } = await import('../workspaces/route')
    const request = jsonRequest('http://localhost/api/workspaces', 'POST', {
      name: '',
    })
    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error.code).toBe('VALIDATION_ERROR')
  })

  it('returns 400 for invalid github repo format', async () => {
    mockGetServerSession.mockResolvedValue(mockSession)

    const { POST } = await import('../workspaces/route')
    const request = jsonRequest('http://localhost/api/workspaces', 'POST', {
      name: 'Test',
      githubRepo: 'not-a-repo',
    })
    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error.code).toBe('VALIDATION_ERROR')
  })

  it('creates a workspace and adds owner as member', async () => {
    mockGetServerSession.mockResolvedValue(mockSession)
    // Slug uniqueness check - no existing slug
    mockDbInstance.addChain([])
    // Insert workspace returning
    mockDbInstance.addChain([mockWorkspace])
    // Insert member (no returning)
    mockDbInstance.addChain(undefined)

    const { POST } = await import('../workspaces/route')
    const request = jsonRequest('http://localhost/api/workspaces', 'POST', {
      name: 'Test Workspace',
      githubRepo: 'owner/repo',
    })
    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(201)
    expect(data.data).toEqual(mockWorkspace)
  })

  it('generates unique slug when slug already exists', async () => {
    mockGetServerSession.mockResolvedValue(mockSession)
    // First slug check - exists
    mockDbInstance.addChain([{ id: 'existing-1' }])
    // Second slug check (with -1) - not exists
    mockDbInstance.addChain([])
    // Insert workspace
    mockDbInstance.addChain([{ ...mockWorkspace, slug: 'test-workspace-1' }])
    // Insert member
    mockDbInstance.addChain(undefined)

    const { POST } = await import('../workspaces/route')
    const request = jsonRequest('http://localhost/api/workspaces', 'POST', {
      name: 'Test Workspace',
      githubRepo: 'owner/repo',
    })
    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(201)
    expect(data.data.slug).toBe('test-workspace-1')
  })
})

describe('GET /api/workspaces/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDbInstance.reset()
  })

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const { GET } = await import('../workspaces/[id]/route')
    const request = new Request('http://localhost/api/workspaces/ws-1')
    const response = await GET(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error.code).toBe('UNAUTHORIZED')
  })

  it('returns 404 for non-existent workspace', async () => {
    mockGetServerSession.mockResolvedValue(mockSession)
    mockDbInstance.addChain([]) // No workspace found

    const { GET } = await import('../workspaces/[id]/route')
    const request = new Request('http://localhost/api/workspaces/nonexistent')
    const response = await GET(request, { params: { id: 'nonexistent' } })
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.error.code).toBe('WORKSPACE_NOT_FOUND')
  })

  it('returns 403 when user is not a member', async () => {
    mockGetServerSession.mockResolvedValue(mockSessionOther)
    // Workspace exists but owned by user-1
    mockDbInstance.addChain([mockWorkspace])
    // Membership check - not a member
    mockDbInstance.addChain([])

    const { GET } = await import('../workspaces/[id]/route')
    const request = new Request('http://localhost/api/workspaces/ws-1')
    const response = await GET(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.error.code).toBe('FORBIDDEN')
  })

  it('returns workspace for the owner', async () => {
    mockGetServerSession.mockResolvedValue(mockSession)
    mockDbInstance.addChain([mockWorkspace])

    const { GET } = await import('../workspaces/[id]/route')
    const request = new Request('http://localhost/api/workspaces/ws-1')
    const response = await GET(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.data).toEqual(mockWorkspace)
  })

  it('returns workspace for a member', async () => {
    mockGetServerSession.mockResolvedValue(mockSessionOther)
    // Workspace exists, owned by user-1
    mockDbInstance.addChain([mockWorkspace])
    // Membership check passes
    mockDbInstance.addChain([mockMembership])

    const { GET } = await import('../workspaces/[id]/route')
    const request = new Request('http://localhost/api/workspaces/ws-1')
    const response = await GET(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.data).toEqual(mockWorkspace)
  })
})

describe('PATCH /api/workspaces/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDbInstance.reset()
  })

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const { PATCH } = await import('../workspaces/[id]/route')
    const request = jsonRequest('http://localhost/api/workspaces/ws-1', 'PATCH', {
      name: 'Updated',
    })
    const response = await PATCH(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error.code).toBe('UNAUTHORIZED')
  })

  it('returns 404 for non-existent workspace', async () => {
    mockGetServerSession.mockResolvedValue(mockSession)
    mockDbInstance.addChain([])

    const { PATCH } = await import('../workspaces/[id]/route')
    const request = jsonRequest('http://localhost/api/workspaces/ws-1', 'PATCH', {
      name: 'Updated',
    })
    const response = await PATCH(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.error.code).toBe('WORKSPACE_NOT_FOUND')
  })

  it('returns 403 when non-owner tries to update', async () => {
    mockGetServerSession.mockResolvedValue(mockSessionOther)
    mockDbInstance.addChain([mockWorkspace])

    const { PATCH } = await import('../workspaces/[id]/route')
    const request = jsonRequest('http://localhost/api/workspaces/ws-1', 'PATCH', {
      name: 'Updated',
    })
    const response = await PATCH(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.error.code).toBe('FORBIDDEN')
  })

  it('returns 400 for invalid update body', async () => {
    mockGetServerSession.mockResolvedValue(mockSession)
    mockDbInstance.addChain([mockWorkspace])

    const { PATCH } = await import('../workspaces/[id]/route')
    const request = jsonRequest('http://localhost/api/workspaces/ws-1', 'PATCH', {
      autoCommitIdleMinutes: 999, // max is 60
    })
    const response = await PATCH(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error.code).toBe('VALIDATION_ERROR')
  })

  it('updates workspace settings for owner', async () => {
    const updatedWorkspace = { ...mockWorkspace, name: 'Updated Name' }
    mockGetServerSession.mockResolvedValue(mockSession)
    mockDbInstance.addChain([mockWorkspace]) // Workspace lookup
    mockDbInstance.addChain([updatedWorkspace]) // Update returning

    const { PATCH } = await import('../workspaces/[id]/route')
    const request = jsonRequest('http://localhost/api/workspaces/ws-1', 'PATCH', {
      name: 'Updated Name',
    })
    const response = await PATCH(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.data.name).toBe('Updated Name')
  })
})

describe('GET /api/workspaces/[id]/documents', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDbInstance.reset()
  })

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const { GET } = await import('../workspaces/[id]/documents/route')
    const request = new Request('http://localhost/api/workspaces/ws-1/documents')
    const response = await GET(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error.code).toBe('UNAUTHORIZED')
  })

  it('returns 404 for non-existent workspace', async () => {
    mockGetServerSession.mockResolvedValue(mockSession)
    mockDbInstance.addChain([])

    const { GET } = await import('../workspaces/[id]/documents/route')
    const request = new Request('http://localhost/api/workspaces/ws-1/documents')
    const response = await GET(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.error.code).toBe('WORKSPACE_NOT_FOUND')
  })

  it('returns 403 when non-member accesses documents', async () => {
    mockGetServerSession.mockResolvedValue(mockSessionOther)
    mockDbInstance.addChain([mockWorkspace])
    mockDbInstance.addChain([]) // No membership

    const { GET } = await import('../workspaces/[id]/documents/route')
    const request = new Request('http://localhost/api/workspaces/ws-1/documents')
    const response = await GET(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.error.code).toBe('FORBIDDEN')
  })

  it('returns documents for workspace owner', async () => {
    const mockDocs = [
      { id: 'doc-1', path: 'readme.md', contentHash: 'abc', lastModifiedAt: '2024-01-15T12:00:00.000Z', createdAt: '2024-01-15T12:00:00.000Z' },
    ]
    mockGetServerSession.mockResolvedValue(mockSession)
    mockDbInstance.addChain([mockWorkspace])
    mockDbInstance.addChain(mockDocs)

    const { GET } = await import('../workspaces/[id]/documents/route')
    const request = new Request('http://localhost/api/workspaces/ws-1/documents')
    const response = await GET(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.data).toEqual(mockDocs)
  })

  it('returns documents for workspace member', async () => {
    mockGetServerSession.mockResolvedValue(mockSessionOther)
    mockDbInstance.addChain([mockWorkspace])
    mockDbInstance.addChain([mockMembership])
    mockDbInstance.addChain([])

    const { GET } = await import('../workspaces/[id]/documents/route')
    const request = new Request('http://localhost/api/workspaces/ws-1/documents')
    const response = await GET(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.data).toEqual([])
  })
})
