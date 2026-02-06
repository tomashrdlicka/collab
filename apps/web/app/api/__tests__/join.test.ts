import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  mockSession,
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

// --- Mock data ---

const mockShareLink = {
  id: 'link-1',
  workspaceId: 'ws-1',
  code: 'joincode',
  permission: 'editor',
  requireGithub: true,
  expiresAt: null,
  maxUses: null,
  useCount: 0,
  createdBy: 'user-3',
  disabledAt: null,
  createdAt: '2024-01-15T12:00:00.000Z',
}

const futureDate = new Date(Date.now() + 600_000)
const pastDate = new Date(Date.now() - 600_000)

// --- POST /api/join/[code] ---

describe('POST /api/join/[code]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDbInstance.reset()
  })

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const { POST } = await import('../join/[code]/route')
    const request = jsonRequest('http://localhost/api/join/joincode', 'POST', {})
    const response = await POST(request, { params: { code: 'joincode' } })
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error.code).toBe('UNAUTHORIZED')
  })

  it('returns 404 for invalid share link code', async () => {
    mockGetServerSession.mockResolvedValue(mockSession)
    mockDbInstance.addChain([]) // Link not found

    const { POST } = await import('../join/[code]/route')
    const request = jsonRequest('http://localhost/api/join/badcode', 'POST', {})
    const response = await POST(request, { params: { code: 'badcode' } })
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.error.code).toBe('NOT_FOUND')
  })

  it('returns 410 for disabled share link', async () => {
    const disabledLink = { ...mockShareLink, disabledAt: new Date() }
    mockGetServerSession.mockResolvedValue(mockSession)
    mockDbInstance.addChain([disabledLink])

    const { POST } = await import('../join/[code]/route')
    const request = jsonRequest('http://localhost/api/join/joincode', 'POST', {})
    const response = await POST(request, { params: { code: 'joincode' } })
    const data = await response.json()

    expect(response.status).toBe(410)
    expect(data.error.code).toBe('DISABLED')
  })

  it('returns 410 for expired share link', async () => {
    const expiredLink = { ...mockShareLink, expiresAt: pastDate }
    mockGetServerSession.mockResolvedValue(mockSession)
    mockDbInstance.addChain([expiredLink])

    const { POST } = await import('../join/[code]/route')
    const request = jsonRequest('http://localhost/api/join/joincode', 'POST', {})
    const response = await POST(request, { params: { code: 'joincode' } })
    const data = await response.json()

    expect(response.status).toBe(410)
    expect(data.error.code).toBe('EXPIRED')
  })

  it('returns 410 when max uses reached', async () => {
    const maxedLink = { ...mockShareLink, maxUses: 5, useCount: 5 }
    mockGetServerSession.mockResolvedValue(mockSession)
    mockDbInstance.addChain([maxedLink])

    const { POST } = await import('../join/[code]/route')
    const request = jsonRequest('http://localhost/api/join/joincode', 'POST', {})
    const response = await POST(request, { params: { code: 'joincode' } })
    const data = await response.json()

    expect(response.status).toBe(410)
    expect(data.error.code).toBe('MAX_USES')
  })

  it('returns workspace slug and alreadyMember true when already a member', async () => {
    mockGetServerSession.mockResolvedValue(mockSession)
    mockDbInstance.addChain([mockShareLink]) // Share link found
    mockDbInstance.addChain([mockMembership]) // Already a member
    mockDbInstance.addChain([{ slug: 'test-workspace' }]) // Workspace slug

    const { POST } = await import('../join/[code]/route')
    const request = jsonRequest('http://localhost/api/join/joincode', 'POST', {})
    const response = await POST(request, { params: { code: 'joincode' } })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.data.alreadyMember).toBe(true)
    expect(data.data.slug).toBe('test-workspace')
  })

  it('joins workspace successfully and returns slug', async () => {
    mockGetServerSession.mockResolvedValue(mockSession)
    mockDbInstance.addChain([mockShareLink]) // Share link found
    mockDbInstance.addChain([]) // Not already a member
    mockDbInstance.addChain(undefined) // Insert member
    mockDbInstance.addChain(undefined) // Increment use count
    mockDbInstance.addChain([{ slug: 'test-workspace' }]) // Workspace slug

    const { POST } = await import('../join/[code]/route')
    const request = jsonRequest('http://localhost/api/join/joincode', 'POST', {})
    const response = await POST(request, { params: { code: 'joincode' } })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.data.alreadyMember).toBe(false)
    expect(data.data.slug).toBe('test-workspace')
  })

  it('allows joining with future expiry date', async () => {
    const futureLink = { ...mockShareLink, expiresAt: futureDate }
    mockGetServerSession.mockResolvedValue(mockSession)
    mockDbInstance.addChain([futureLink])
    mockDbInstance.addChain([])
    mockDbInstance.addChain(undefined)
    mockDbInstance.addChain(undefined)
    mockDbInstance.addChain([{ slug: 'test-workspace' }])

    const { POST } = await import('../join/[code]/route')
    const request = jsonRequest('http://localhost/api/join/joincode', 'POST', {})
    const response = await POST(request, { params: { code: 'joincode' } })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.data.alreadyMember).toBe(false)
  })

  it('allows joining when useCount is less than maxUses', async () => {
    const underLimitLink = { ...mockShareLink, maxUses: 10, useCount: 3 }
    mockGetServerSession.mockResolvedValue(mockSession)
    mockDbInstance.addChain([underLimitLink])
    mockDbInstance.addChain([])
    mockDbInstance.addChain(undefined)
    mockDbInstance.addChain(undefined)
    mockDbInstance.addChain([{ slug: 'test-workspace' }])

    const { POST } = await import('../join/[code]/route')
    const request = jsonRequest('http://localhost/api/join/joincode', 'POST', {})
    const response = await POST(request, { params: { code: 'joincode' } })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.data.alreadyMember).toBe(false)
  })
})
