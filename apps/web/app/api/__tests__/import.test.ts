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

const mockScanRepositoryMarkdownFiles = vi.fn()
const mockFetchFileContents = vi.fn()
vi.mock('@/lib/github-read', () => ({
  scanRepositoryMarkdownFiles: (...args: unknown[]) => mockScanRepositoryMarkdownFiles(...args),
  fetchFileContents: (...args: unknown[]) => mockFetchFileContents(...args),
}))

vi.mock('@collab/sync', () => ({
  createCollabDoc: () => ({ getText: () => ({ toString: () => '' }) }),
  encodeDocState: () => new Uint8Array([1, 2, 3]),
  computeContentHash: (content: string) => `hash-${content.length}`,
}))

// --- POST /api/workspaces/[id]/import ---

describe('POST /api/workspaces/[id]/import', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDbInstance.reset()
    mockScanRepositoryMarkdownFiles.mockReset()
    mockFetchFileContents.mockReset()
  })

  it('returns 401 when not authenticated', async () => {
    mockGetServerSession.mockResolvedValue(null)

    const { POST } = await import('../workspaces/[id]/import/route')
    const request = jsonRequest('http://localhost/api/workspaces/ws-1/import', 'POST')
    const response = await POST(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error.code).toBe('UNAUTHORIZED')
  })

  it('returns 404 for non-existent workspace', async () => {
    mockGetServerSession.mockResolvedValue(mockSession)
    mockDbInstance.addChain([]) // No workspace

    const { POST } = await import('../workspaces/[id]/import/route')
    const request = jsonRequest('http://localhost/api/workspaces/ws-1/import', 'POST')
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

    const { POST } = await import('../workspaces/[id]/import/route')
    const request = jsonRequest('http://localhost/api/workspaces/ws-1/import', 'POST')
    const response = await POST(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.error.code).toBe('FORBIDDEN')
  })

  it('returns 403 for non-member', async () => {
    mockGetServerSession.mockResolvedValue(mockSessionOther)
    mockDbInstance.addChain([mockWorkspace]) // Workspace lookup
    mockDbInstance.addChain([]) // No membership

    const { POST } = await import('../workspaces/[id]/import/route')
    const request = jsonRequest('http://localhost/api/workspaces/ws-1/import', 'POST')
    const response = await POST(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.error.code).toBe('FORBIDDEN')
  })

  it('imports markdown files successfully', async () => {
    mockGetServerSession.mockResolvedValue(mockSession)
    mockDbInstance.addChain([mockWorkspace]) // Workspace lookup

    // Scan returns two files
    mockScanRepositoryMarkdownFiles.mockResolvedValue({
      files: [
        { path: 'README.md', size: 100, sha: 'sha1' },
        { path: 'docs/guide.md', size: 200, sha: 'sha2' },
      ],
      truncated: false,
    })

    // No existing documents
    mockDbInstance.addChain([])

    // Fetch returns content for both files
    mockFetchFileContents.mockResolvedValue({
      results: [
        { path: 'README.md', content: '# Hello' },
        { path: 'docs/guide.md', content: '# Guide' },
      ],
      errors: [],
    })

    // Insert document + insert change for each file (2 files = 4 DB operations)
    mockDbInstance.addChain([{ id: 'doc-1' }]) // Insert doc 1 returning
    mockDbInstance.addChain(undefined) // Insert change 1
    mockDbInstance.addChain([{ id: 'doc-2' }]) // Insert doc 2 returning
    mockDbInstance.addChain(undefined) // Insert change 2

    const { POST } = await import('../workspaces/[id]/import/route')
    const request = jsonRequest('http://localhost/api/workspaces/ws-1/import', 'POST')
    const response = await POST(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.data.imported).toBe(2)
    expect(data.data.skipped).toBe(0)
    expect(data.data.errors).toBe(0)
    expect(data.data.truncated).toBe(false)
    expect(data.data.files).toHaveLength(2)
    expect(data.data.files[0].status).toBe('imported')
    expect(data.data.files[1].status).toBe('imported')
  })

  it('skips already-imported files', async () => {
    mockGetServerSession.mockResolvedValue(mockSession)
    mockDbInstance.addChain([mockWorkspace]) // Workspace lookup

    // Scan returns two files
    mockScanRepositoryMarkdownFiles.mockResolvedValue({
      files: [
        { path: 'README.md', size: 100, sha: 'sha1' },
        { path: 'docs/guide.md', size: 200, sha: 'sha2' },
      ],
      truncated: false,
    })

    // README.md already exists in DB
    mockDbInstance.addChain([{ path: 'README.md' }])

    // Fetch only new file
    mockFetchFileContents.mockResolvedValue({
      results: [{ path: 'docs/guide.md', content: '# Guide' }],
      errors: [],
    })

    // Insert operations for 1 new file
    mockDbInstance.addChain([{ id: 'doc-1' }]) // Insert doc returning
    mockDbInstance.addChain(undefined) // Insert change

    const { POST } = await import('../workspaces/[id]/import/route')
    const request = jsonRequest('http://localhost/api/workspaces/ws-1/import', 'POST')
    const response = await POST(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.data.imported).toBe(1)
    expect(data.data.skipped).toBe(1)

    const skipped = data.data.files.find((f: { path: string }) => f.path === 'README.md')
    expect(skipped.status).toBe('skipped')
    expect(skipped.reason).toBe('Already exists')
  })

  it('returns all-skipped when every file already exists', async () => {
    mockGetServerSession.mockResolvedValue(mockSession)
    mockDbInstance.addChain([mockWorkspace]) // Workspace lookup

    mockScanRepositoryMarkdownFiles.mockResolvedValue({
      files: [{ path: 'README.md', size: 100, sha: 'sha1' }],
      truncated: false,
    })

    // File already exists
    mockDbInstance.addChain([{ path: 'README.md' }])

    const { POST } = await import('../workspaces/[id]/import/route')
    const request = jsonRequest('http://localhost/api/workspaces/ws-1/import', 'POST')
    const response = await POST(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.data.imported).toBe(0)
    expect(data.data.skipped).toBe(1)
    // fetchFileContents should not be called when there are no new files
    expect(mockFetchFileContents).not.toHaveBeenCalled()
  })

  it('handles fetch errors for individual files', async () => {
    mockGetServerSession.mockResolvedValue(mockSession)
    mockDbInstance.addChain([mockWorkspace]) // Workspace lookup

    mockScanRepositoryMarkdownFiles.mockResolvedValue({
      files: [
        { path: 'good.md', size: 100, sha: 'sha1' },
        { path: 'bad.md', size: 200, sha: 'sha2' },
      ],
      truncated: false,
    })

    // No existing docs
    mockDbInstance.addChain([])

    // One succeeds, one fails
    mockFetchFileContents.mockResolvedValue({
      results: [{ path: 'good.md', content: '# Good' }],
      errors: [{ path: 'bad.md', error: 'HTTP 404: Not Found' }],
    })

    // Insert operations for 1 successful file
    mockDbInstance.addChain([{ id: 'doc-1' }])
    mockDbInstance.addChain(undefined)

    const { POST } = await import('../workspaces/[id]/import/route')
    const request = jsonRequest('http://localhost/api/workspaces/ws-1/import', 'POST')
    const response = await POST(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.data.imported).toBe(1)
    expect(data.data.errors).toBe(1)

    const errorFile = data.data.files.find((f: { path: string }) => f.path === 'bad.md')
    expect(errorFile.status).toBe('error')
    expect(errorFile.reason).toBe('HTTP 404: Not Found')
  })

  it('returns 500 when scan fails', async () => {
    mockGetServerSession.mockResolvedValue(mockSession)
    mockDbInstance.addChain([mockWorkspace])

    mockScanRepositoryMarkdownFiles.mockRejectedValue(new Error('GitHub API error'))

    vi.spyOn(console, 'error').mockImplementation(() => {})

    const { POST } = await import('../workspaces/[id]/import/route')
    const request = jsonRequest('http://localhost/api/workspaces/ws-1/import', 'POST')
    const response = await POST(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error.code).toBe('IMPORT_FAILED')

    vi.mocked(console.error).mockRestore()
  })

  it('allows editor members to import', async () => {
    mockGetServerSession.mockResolvedValue(mockSessionOther)
    mockDbInstance.addChain([mockWorkspace]) // Workspace lookup
    mockDbInstance.addChain([mockMembership]) // Editor membership

    mockScanRepositoryMarkdownFiles.mockResolvedValue({
      files: [{ path: 'README.md', size: 100, sha: 'sha1' }],
      truncated: false,
    })

    mockDbInstance.addChain([]) // No existing docs

    mockFetchFileContents.mockResolvedValue({
      results: [{ path: 'README.md', content: '# Hello' }],
      errors: [],
    })

    mockDbInstance.addChain([{ id: 'doc-1' }])
    mockDbInstance.addChain(undefined)

    const { POST } = await import('../workspaces/[id]/import/route')
    const request = jsonRequest('http://localhost/api/workspaces/ws-1/import', 'POST')
    const response = await POST(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.data.imported).toBe(1)
  })

  it('reports truncated when repo tree is too large', async () => {
    mockGetServerSession.mockResolvedValue(mockSession)
    mockDbInstance.addChain([mockWorkspace])

    mockScanRepositoryMarkdownFiles.mockResolvedValue({
      files: [{ path: 'README.md', size: 100, sha: 'sha1' }],
      truncated: true,
    })

    mockDbInstance.addChain([]) // No existing docs

    mockFetchFileContents.mockResolvedValue({
      results: [{ path: 'README.md', content: '# Hello' }],
      errors: [],
    })

    mockDbInstance.addChain([{ id: 'doc-1' }])
    mockDbInstance.addChain(undefined)

    const { POST } = await import('../workspaces/[id]/import/route')
    const request = jsonRequest('http://localhost/api/workspaces/ws-1/import', 'POST')
    const response = await POST(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.data.truncated).toBe(true)
  })

  it('returns 400 for invalid repo format', async () => {
    const badRepoWorkspace = { ...mockWorkspace, githubRepo: 'invalid-no-slash' }
    mockGetServerSession.mockResolvedValue(mockSession)
    mockDbInstance.addChain([badRepoWorkspace])

    const { POST } = await import('../workspaces/[id]/import/route')
    const request = jsonRequest('http://localhost/api/workspaces/ws-1/import', 'POST')
    const response = await POST(request, { params: { id: 'ws-1' } })
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error.code).toBe('VALIDATION_ERROR')
  })
})
