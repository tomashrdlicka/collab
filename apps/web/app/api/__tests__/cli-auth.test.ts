import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  mockSession,
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
    generateShareCode: () => 'clicode1',
  }
})

// --- Mock data ---

const futureDate = new Date(Date.now() + 600_000) // 10 min from now
const pastDate = new Date(Date.now() - 600_000) // 10 min ago

const mockAuthCode = {
  id: 'auth-1',
  code: 'clicode1',
  deviceName: 'test-device',
  userId: null,
  expiresAt: futureDate,
  usedAt: null,
  createdAt: new Date(),
}

const mockConfirmedAuthCode = {
  ...mockAuthCode,
  userId: 'user-1',
}

const mockExpiredAuthCode = {
  ...mockAuthCode,
  expiresAt: pastDate,
}

// --- POST /api/cli/auth/start ---

describe('POST /api/cli/auth/start', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDbInstance.reset()
  })

  it('creates auth code with device name', async () => {
    mockDbInstance.addChain(undefined) // Insert

    const { POST } = await import('../cli/auth/start/route')
    const request = jsonRequest('http://localhost/api/cli/auth/start', 'POST', {
      deviceName: 'my-laptop',
    })
    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.data.code).toBe('clicode1')
    expect(data.data.authUrl).toContain('clicode1')
    expect(data.data.expiresAt).toBeDefined()
  })

  it('creates auth code without device name', async () => {
    mockDbInstance.addChain(undefined)

    const { POST } = await import('../cli/auth/start/route')
    const request = jsonRequest('http://localhost/api/cli/auth/start', 'POST', {})
    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.data.code).toBe('clicode1')
  })

  it('returns auth URL with correct base', async () => {
    mockDbInstance.addChain(undefined)

    const { POST } = await import('../cli/auth/start/route')
    const request = jsonRequest('http://localhost/api/cli/auth/start', 'POST', {})
    const response = await POST(request)
    const data = await response.json()

    expect(data.data.authUrl).toContain('/login?cli_code=clicode1')
  })
})

// --- GET /api/cli/auth/poll/[code] ---

describe('GET /api/cli/auth/poll/[code]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDbInstance.reset()
  })

  it('returns 404 for non-existent code', async () => {
    mockDbInstance.addChain([])

    const { GET } = await import('../cli/auth/poll/[code]/route')
    const request = new Request('http://localhost/api/cli/auth/poll/nonexistent')
    const response = await GET(request, { params: { code: 'nonexistent' } })
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.error.code).toBe('NOT_FOUND')
  })

  it('returns 410 for expired code', async () => {
    mockDbInstance.addChain([mockExpiredAuthCode])

    const { GET } = await import('../cli/auth/poll/[code]/route')
    const request = new Request('http://localhost/api/cli/auth/poll/clicode1')
    const response = await GET(request, { params: { code: 'clicode1' } })
    const data = await response.json()

    expect(response.status).toBe(410)
    expect(data.error.code).toBe('EXPIRED')
  })

  it('returns pending status when not yet confirmed', async () => {
    mockDbInstance.addChain([mockAuthCode])

    const { GET } = await import('../cli/auth/poll/[code]/route')
    const request = new Request('http://localhost/api/cli/auth/poll/clicode1')
    const response = await GET(request, { params: { code: 'clicode1' } })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.data.status).toBe('pending')
  })

  it('returns completed status with user info when confirmed', async () => {
    const mockUserInfo = { id: 'user-1', githubUsername: 'test-user' }
    mockDbInstance.addChain([mockConfirmedAuthCode])
    mockDbInstance.addChain([mockUserInfo]) // User lookup
    mockDbInstance.addChain(undefined) // Mark as used

    const { GET } = await import('../cli/auth/poll/[code]/route')
    const request = new Request('http://localhost/api/cli/auth/poll/clicode1')
    const response = await GET(request, { params: { code: 'clicode1' } })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.data.status).toBe('completed')
    expect(data.data.userId).toBe('user-1')
    expect(data.data.username).toBe('test-user')
  })

  it('returns pending when userId set but user not found', async () => {
    mockDbInstance.addChain([mockConfirmedAuthCode])
    mockDbInstance.addChain([]) // User not found

    const { GET } = await import('../cli/auth/poll/[code]/route')
    const request = new Request('http://localhost/api/cli/auth/poll/clicode1')
    const response = await GET(request, { params: { code: 'clicode1' } })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.data.status).toBe('pending')
  })
})

// --- GET /api/cli/auth/confirm ---

describe('GET /api/cli/auth/confirm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDbInstance.reset()
  })

  it('redirects to login when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const { GET } = await import('../cli/auth/confirm/route')
    const request = new Request('http://localhost/api/cli/auth/confirm?code=clicode1')
    const response = await GET(request)

    expect(response.status).toBe(307)
    const location = response.headers.get('location')
    expect(location).toContain('/login')
  })

  it('redirects to dashboard with error when code is missing', async () => {
    mockGetServerSession.mockResolvedValue(mockSession)

    const { GET } = await import('../cli/auth/confirm/route')
    const request = new Request('http://localhost/api/cli/auth/confirm')
    const response = await GET(request)

    expect(response.status).toBe(307)
    const location = response.headers.get('location')
    expect(location).toContain('error=missing_code')
  })

  it('redirects to dashboard with error for invalid code', async () => {
    mockGetServerSession.mockResolvedValue(mockSession)
    mockDbInstance.addChain([]) // Code not found

    const { GET } = await import('../cli/auth/confirm/route')
    const request = new Request('http://localhost/api/cli/auth/confirm?code=invalid')
    const response = await GET(request)

    expect(response.status).toBe(307)
    const location = response.headers.get('location')
    expect(location).toContain('error=invalid_code')
  })

  it('redirects to dashboard with error for expired code', async () => {
    mockGetServerSession.mockResolvedValue(mockSession)
    mockDbInstance.addChain([mockExpiredAuthCode])

    const { GET } = await import('../cli/auth/confirm/route')
    const request = new Request('http://localhost/api/cli/auth/confirm?code=clicode1')
    const response = await GET(request)

    expect(response.status).toBe(307)
    const location = response.headers.get('location')
    expect(location).toContain('error=expired_code')
  })

  it('redirects with already confirmed message when code has userId', async () => {
    mockGetServerSession.mockResolvedValue(mockSession)
    mockDbInstance.addChain([mockConfirmedAuthCode])

    const { GET } = await import('../cli/auth/confirm/route')
    const request = new Request('http://localhost/api/cli/auth/confirm?code=clicode1')
    const response = await GET(request)

    expect(response.status).toBe(307)
    const location = response.headers.get('location')
    expect(location).toContain('cli_already_confirmed')
  })

  it('confirms auth code and redirects on success', async () => {
    mockGetServerSession.mockResolvedValue(mockSession)
    mockDbInstance.addChain([mockAuthCode]) // Valid unconfirmed code
    mockDbInstance.addChain(undefined) // Update userId

    const { GET } = await import('../cli/auth/confirm/route')
    const request = new Request('http://localhost/api/cli/auth/confirm?code=clicode1')
    const response = await GET(request)

    expect(response.status).toBe(307)
    const location = response.headers.get('location')
    expect(location).toContain('cli_auth_success')
  })
})
