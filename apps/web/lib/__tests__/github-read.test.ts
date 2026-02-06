import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { scanRepositoryMarkdownFiles, fetchFileContents } from '../github-read'

// Mock the database and crypto
vi.mock('@collab/db/schema', () => ({
  githubTokens: { userId: 'user_id' },
}))

vi.mock('drizzle-orm', () => ({
  eq: (col: unknown, val: unknown) => ({ col, val }),
}))

vi.mock('@collab/shared', () => ({
  decryptToken: (encrypted: unknown) => 'mock-github-token',
}))

// Create a mock DB
const mockSelectChain = {
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  limit: vi.fn(),
}

const mockDb = {
  select: vi.fn().mockReturnValue(mockSelectChain),
} as unknown as Parameters<typeof scanRepositoryMarkdownFiles>[0]

describe('scanRepositoryMarkdownFiles', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: return a token
    mockSelectChain.limit.mockResolvedValue([{ encryptedToken: Buffer.from('encrypted') }])
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns markdown files from repository tree', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        tree: [
          { path: 'README.md', type: 'blob', size: 500, sha: 'sha1' },
          { path: 'docs/guide.md', type: 'blob', size: 300, sha: 'sha2' },
          { path: 'src/index.ts', type: 'blob', size: 200, sha: 'sha3' },
          { path: 'docs', type: 'tree', sha: 'sha4' },
        ],
        truncated: false,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    )

    const result = await scanRepositoryMarkdownFiles(mockDb, 'user-1', 'owner', 'repo', 'main', '/')

    expect(result.files).toHaveLength(2)
    expect(result.files[0]).toEqual({ path: 'README.md', size: 500, sha: 'sha1' })
    expect(result.files[1]).toEqual({ path: 'docs/guide.md', size: 300, sha: 'sha2' })
    expect(result.truncated).toBe(false)
  })

  it('filters by basePath', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        tree: [
          { path: 'README.md', type: 'blob', size: 100, sha: 'sha1' },
          { path: 'docs/readme.md', type: 'blob', size: 100, sha: 'sha2' },
          { path: 'docs/api.md', type: 'blob', size: 100, sha: 'sha3' },
          { path: 'other/file.md', type: 'blob', size: 100, sha: 'sha4' },
        ],
        truncated: false,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    )

    const result = await scanRepositoryMarkdownFiles(mockDb, 'user-1', 'owner', 'repo', 'main', 'docs')

    expect(result.files).toHaveLength(2)
    expect(result.files.map((f) => f.path)).toEqual(['docs/readme.md', 'docs/api.md'])
  })

  it('skips files larger than 1MB', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        tree: [
          { path: 'small.md', type: 'blob', size: 500, sha: 'sha1' },
          { path: 'large.md', type: 'blob', size: 2_000_000, sha: 'sha2' },
        ],
        truncated: false,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    )

    const result = await scanRepositoryMarkdownFiles(mockDb, 'user-1', 'owner', 'repo', 'main', '/')

    expect(result.files).toHaveLength(1)
    expect(result.files[0]!.path).toBe('small.md')
  })

  it('skips non-blob entries (trees/directories)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        tree: [
          { path: 'docs', type: 'tree', sha: 'sha1' },
          { path: 'docs/guide.md', type: 'blob', size: 100, sha: 'sha2' },
        ],
        truncated: false,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    )

    const result = await scanRepositoryMarkdownFiles(mockDb, 'user-1', 'owner', 'repo', 'main', '/')

    expect(result.files).toHaveLength(1)
    expect(result.files[0]!.path).toBe('docs/guide.md')
  })

  it('reports truncated flag', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        tree: [{ path: 'README.md', type: 'blob', size: 100, sha: 'sha1' }],
        truncated: true,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    )

    const result = await scanRepositoryMarkdownFiles(mockDb, 'user-1', 'owner', 'repo', 'main', '/')

    expect(result.truncated).toBe(true)
  })

  it('throws when no GitHub token found', async () => {
    mockSelectChain.limit.mockResolvedValue([])

    await expect(
      scanRepositoryMarkdownFiles(mockDb, 'user-1', 'owner', 'repo', 'main', '/')
    ).rejects.toThrow('No GitHub token found')
  })

  it('throws when GitHub API returns error', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response('Not Found', { status: 404 })
    )

    await expect(
      scanRepositoryMarkdownFiles(mockDb, 'user-1', 'owner', 'repo', 'main', '/')
    ).rejects.toThrow('Failed to scan repository')
  })

  it('sends correct API request', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ tree: [], truncated: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    await scanRepositoryMarkdownFiles(mockDb, 'user-1', 'owner', 'repo', 'develop', '/')

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.github.com/repos/owner/repo/git/trees/develop?recursive=1',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer mock-github-token',
          Accept: 'application/vnd.github+json',
        }),
      })
    )
  })
})

describe('fetchFileContents', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSelectChain.limit.mockResolvedValue([{ encryptedToken: Buffer.from('encrypted') }])
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches and decodes base64 file contents', async () => {
    const content = '# Hello World'
    const base64Content = Buffer.from(content).toString('base64')

    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ encoding: 'base64', content: base64Content }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const files = [{ path: 'README.md', size: 100, sha: 'sha1' }]
    const result = await fetchFileContents(mockDb, 'user-1', 'owner', 'repo', 'main', files)

    expect(result.results).toHaveLength(1)
    expect(result.results[0]).toEqual({ path: 'README.md', content: '# Hello World' })
    expect(result.errors).toHaveLength(0)
  })

  it('handles non-base64 content', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ encoding: 'utf-8', content: '# Direct content' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const files = [{ path: 'README.md', size: 100, sha: 'sha1' }]
    const result = await fetchFileContents(mockDb, 'user-1', 'owner', 'repo', 'main', files)

    expect(result.results[0]!.content).toBe('# Direct content')
  })

  it('collects errors for failed fetches', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response('Not Found', { status: 404 })
    )

    const files = [{ path: 'missing.md', size: 100, sha: 'sha1' }]
    const result = await fetchFileContents(mockDb, 'user-1', 'owner', 'repo', 'main', files)

    expect(result.results).toHaveLength(0)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]!.path).toBe('missing.md')
    expect(result.errors[0]!.error).toContain('HTTP 404')
  })

  it('processes multiple files in batches', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')

    // Create 7 files (should result in 2 batches: 5 + 2)
    const files = Array.from({ length: 7 }, (_, i) => ({
      path: `file${i}.md`,
      size: 100,
      sha: `sha${i}`,
    }))

    // Mock all 7 responses
    for (let i = 0; i < 7; i++) {
      const content = Buffer.from(`# File ${i}`).toString('base64')
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ encoding: 'base64', content }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    }

    const result = await fetchFileContents(mockDb, 'user-1', 'owner', 'repo', 'main', files)

    expect(result.results).toHaveLength(7)
    expect(result.errors).toHaveLength(0)
    // Verify all 7 files were fetched
    expect(fetchSpy).toHaveBeenCalledTimes(7)
  })

  it('handles mixed success and failure in a batch', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')

    const successContent = Buffer.from('# Success').toString('base64')
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ encoding: 'base64', content: successContent }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )
    fetchSpy.mockResolvedValueOnce(
      new Response('Not Found', { status: 404 })
    )

    const files = [
      { path: 'good.md', size: 100, sha: 'sha1' },
      { path: 'bad.md', size: 100, sha: 'sha2' },
    ]

    const result = await fetchFileContents(mockDb, 'user-1', 'owner', 'repo', 'main', files)

    expect(result.results).toHaveLength(1)
    expect(result.results[0]!.path).toBe('good.md')
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]!.path).toBe('bad.md')
  })

  it('throws when no GitHub token found', async () => {
    mockSelectChain.limit.mockResolvedValue([])

    const files = [{ path: 'README.md', size: 100, sha: 'sha1' }]
    await expect(
      fetchFileContents(mockDb, 'user-1', 'owner', 'repo', 'main', files)
    ).rejects.toThrow('No GitHub token found')
  })

  it('returns empty results for empty file list', async () => {
    const result = await fetchFileContents(mockDb, 'user-1', 'owner', 'repo', 'main', [])

    expect(result.results).toHaveLength(0)
    expect(result.errors).toHaveLength(0)
  })
})
