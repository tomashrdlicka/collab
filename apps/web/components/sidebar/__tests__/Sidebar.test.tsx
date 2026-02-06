import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Sidebar } from '../Sidebar'

// Mock next/navigation
const mockPathname = vi.fn().mockReturnValue('/w/test-workspace')
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
}))

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, className, style }: {
    children: React.ReactNode
    href: string
    className?: string
    style?: React.CSSProperties
  }) => (
    <a href={href} className={className} style={style}>{children}</a>
  ),
}))

// Mock cn util
vi.mock('@/lib/utils', () => ({
  cn: (...classes: (string | boolean | undefined | null)[]) =>
    classes.filter(Boolean).join(' '),
}))

const mockDocuments = [
  { path: 'README.md', contentHash: 'hash1' },
  { path: 'docs/guide.md', contentHash: 'hash2' },
  { path: 'docs/api.md', contentHash: 'hash3' },
  { path: 'src/index.ts', contentHash: 'hash4' },
]

const mockChanges = [
  { documentPath: 'README.md', changeType: 'update' },
  { documentPath: 'docs/guide.md', changeType: 'create' },
]

describe('Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPathname.mockReturnValue('/w/test-workspace')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows loading state initially', () => {
    vi.spyOn(global, 'fetch').mockReturnValue(new Promise(() => {}))
    render(<Sidebar workspaceId="ws-1" />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('fetches documents and changes on mount', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: mockDocuments }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: mockChanges }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      )

    render(<Sidebar workspaceId="ws-1" />)

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/api/workspaces/ws-1/documents')
      expect(fetchSpy).toHaveBeenCalledWith('/api/workspaces/ws-1/changes/uncommitted')
    })
  })

  it('displays files after loading', async () => {
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: mockDocuments }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      )

    render(<Sidebar workspaceId="ws-1" />)

    await waitFor(() => {
      expect(screen.getByText('README.md')).toBeInTheDocument()
    })
  })

  it('renders directory structure with folders', async () => {
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: mockDocuments }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      )

    render(<Sidebar workspaceId="ws-1" />)

    await waitFor(() => {
      expect(screen.getByText('docs')).toBeInTheDocument()
      expect(screen.getByText('src')).toBeInTheDocument()
    })
  })

  it('expands directory when clicked', async () => {
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: mockDocuments }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      )

    const user = userEvent.setup()
    render(<Sidebar workspaceId="ws-1" />)

    await waitFor(() => {
      expect(screen.getByText('docs')).toBeInTheDocument()
    })

    // Folders start collapsed, so children are not visible
    expect(screen.queryByText('guide.md')).not.toBeInTheDocument()

    // Click to expand
    await user.click(screen.getByText('docs'))

    // Children should now be visible
    expect(screen.getByText('guide.md')).toBeInTheDocument()
    expect(screen.getByText('api.md')).toBeInTheDocument()
  })

  it('collapses directory when clicked again', async () => {
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: mockDocuments }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      )

    const user = userEvent.setup()
    render(<Sidebar workspaceId="ws-1" />)

    await waitFor(() => {
      expect(screen.getByText('docs')).toBeInTheDocument()
    })

    // Expand
    await user.click(screen.getByText('docs'))
    expect(screen.getByText('guide.md')).toBeInTheDocument()

    // Collapse
    await user.click(screen.getByText('docs'))
    expect(screen.queryByText('guide.md')).not.toBeInTheDocument()
  })

  it('shows "No files yet" when no documents exist', async () => {
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      )

    render(<Sidebar workspaceId="ws-1" />)

    await waitFor(() => {
      expect(screen.getByText('No files yet')).toBeInTheDocument()
    })
  })

  it('renders the header with "Files" and new file button', async () => {
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      )

    render(<Sidebar workspaceId="ws-1" />)

    expect(screen.getByText('Files')).toBeInTheDocument()
    expect(screen.getByText('+')).toBeInTheDocument()
  })

  it('renders footer links for Changes and Settings', async () => {
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      )

    render(<Sidebar workspaceId="ws-1" />)

    expect(screen.getByText('Changes')).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('creates file links with correct hrefs', async () => {
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ path: 'README.md' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      )

    render(<Sidebar workspaceId="ws-1" />)

    await waitFor(() => {
      const link = screen.getByText('README.md').closest('a')
      expect(link).toHaveAttribute('href', '/w/test-workspace/README.md')
    })
  })

  it('shows modified indicator for changed files', async () => {
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ path: 'README.md' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ documentPath: 'README.md', changeType: 'update' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      )

    const { container } = render(<Sidebar workspaceId="ws-1" />)

    await waitFor(() => {
      expect(screen.getByText('README.md')).toBeInTheDocument()
    })

    const indicator = container.querySelector('.change-indicator.modified')
    expect(indicator).toBeInTheDocument()
  })

  it('shows new indicator for newly created files', async () => {
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ path: 'new-file.md' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [{ documentPath: 'new-file.md', changeType: 'create' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      )

    const { container } = render(<Sidebar workspaceId="ws-1" />)

    await waitFor(() => {
      expect(screen.getByText('new-file.md')).toBeInTheDocument()
    })

    const indicator = container.querySelector('.change-indicator.new')
    expect(indicator).toBeInTheDocument()
  })

  it('sorts directories before files', async () => {
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          data: [
            { path: 'zebra.md' },
            { path: 'alpha/file.md' },
            { path: 'beta.md' },
          ],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      )

    const { container } = render(<Sidebar workspaceId="ws-1" />)

    await waitFor(() => {
      expect(screen.getByText('alpha')).toBeInTheDocument()
    })

    // Get all text content nodes to check ordering
    const items = container.querySelectorAll('.file-tree-item')
    const texts: string[] = []
    items.forEach((item) => {
      const text = item.textContent?.trim()
      if (text) texts.push(text)
    })

    // 'alpha' directory should appear before 'beta.md' and 'zebra.md' files
    const alphaIndex = texts.findIndex((t) => t.includes('alpha'))
    const betaIndex = texts.findIndex((t) => t.includes('beta'))
    expect(alphaIndex).toBeLessThan(betaIndex)
  })

  it('handles fetch errors gracefully', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'))
    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(<Sidebar workspaceId="ws-1" />)

    await waitFor(() => {
      expect(screen.getByText('No files yet')).toBeInTheDocument()
    })

    vi.mocked(console.error).mockRestore()
  })
})
