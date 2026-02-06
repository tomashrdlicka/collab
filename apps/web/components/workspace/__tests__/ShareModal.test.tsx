import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ShareModal } from '../ShareModal'

// Mock the workspace provider
vi.mock('@/app/w/[slug]/workspace-provider', () => ({
  useWorkspace: () => ({
    workspace: {
      id: 'ws-1',
      name: 'Test Workspace',
      slug: 'test-workspace',
      githubRepo: 'user/repo',
      githubBranch: 'main',
    },
    user: {
      id: 'user-1',
      name: 'Test User',
      role: 'owner' as const,
    },
  }),
}))

// Mock formatRelativeTime
vi.mock('@/lib/utils', () => ({
  formatRelativeTime: (date: string) => `${date} (relative)`,
}))

const mockLinks = [
  {
    id: 'link-1',
    code: 'abc12345',
    permission: 'editor',
    expiresAt: null,
    maxUses: null,
    useCount: 3,
    disabledAt: null,
    createdAt: '2024-01-15T12:00:00Z',
  },
  {
    id: 'link-2',
    code: 'def67890',
    permission: 'viewer',
    expiresAt: '2024-12-31T00:00:00Z',
    maxUses: 10,
    useCount: 0,
    disabledAt: null,
    createdAt: '2024-01-20T12:00:00Z',
  },
  {
    id: 'link-3',
    code: 'ghi11111',
    permission: 'editor',
    expiresAt: null,
    maxUses: null,
    useCount: 1,
    disabledAt: '2024-01-25T12:00:00Z',
    createdAt: '2024-01-10T12:00:00Z',
  },
]

describe('ShareModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <ShareModal isOpen={false} onClose={vi.fn()} />
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders modal title when open', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    )

    render(<ShareModal isOpen={true} onClose={vi.fn()} />)
    expect(screen.getByText('Share Workspace')).toBeInTheDocument()
  })

  it('shows loading state initially', () => {
    vi.spyOn(global, 'fetch').mockReturnValue(new Promise(() => {}))
    render(<ShareModal isOpen={true} onClose={vi.fn()} />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('fetches share links when opened', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: mockLinks }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    )

    render(<ShareModal isOpen={true} onClose={vi.fn()} />)

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/api/workspaces/ws-1/share-links')
    })
  })

  it('displays active links (excludes disabled)', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: mockLinks }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    )

    render(<ShareModal isOpen={true} onClose={vi.fn()} />)

    await waitFor(() => {
      // Only 2 active links (link-3 is disabled)
      expect(screen.getByText('Active Links (2)')).toBeInTheDocument()
    })
  })

  it('shows "No active share links" when none exist', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    )

    render(<ShareModal isOpen={true} onClose={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('No active share links')).toBeInTheDocument()
    })
  })

  it('displays link permission and use count', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: [mockLinks[0]] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    )

    render(<ShareModal isOpen={true} onClose={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('editor')).toBeInTheDocument()
      expect(screen.getByText('3 uses')).toBeInTheDocument()
    })
  })

  it('displays singular use count', async () => {
    const singleUseLink = { ...mockLinks[0]!, useCount: 1 }
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: [singleUseLink] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    )

    render(<ShareModal isOpen={true} onClose={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('1 use')).toBeInTheDocument()
    })
  })

  it('calls onClose when X button is clicked', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    )

    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<ShareModal isOpen={true} onClose={onClose} />)

    await user.click(screen.getByText('X'))
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onClose when backdrop is clicked', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    )

    const onClose = vi.fn()
    const user = userEvent.setup()
    const { container } = render(<ShareModal isOpen={true} onClose={onClose} />)

    const backdrop = container.querySelector('.bg-black\\/50')
    if (backdrop) {
      await user.click(backdrop)
    }
    expect(onClose).toHaveBeenCalled()
  })

  it('has a permission dropdown with editor and viewer options', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    )

    render(<ShareModal isOpen={true} onClose={vi.fn()} />)

    const select = screen.getByDisplayValue('Editor')
    expect(select).toBeInTheDocument()

    const options = select.querySelectorAll('option')
    expect(options).toHaveLength(2)
    expect(options[0]!.textContent).toBe('Editor')
    expect(options[1]!.textContent).toBe('Viewer')
  })

  it('creates a share link when "Create Share Link" button is clicked', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { id: 'new-link' } }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [mockLinks[0]] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      )

    const user = userEvent.setup()
    render(<ShareModal isOpen={true} onClose={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Create Share Link')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Create Share Link'))

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/workspaces/ws-1/share-links',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ permission: 'editor' }),
      })
    )
  })

  it('shows "Creating..." while creating a link', async () => {
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      )
      .mockReturnValueOnce(new Promise(() => {}))

    const user = userEvent.setup()
    render(<ShareModal isOpen={true} onClose={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Create Share Link')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Create Share Link'))

    expect(screen.getByText('Creating...')).toBeInTheDocument()
  })

  it('shows Copied feedback when Copy button is clicked', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: [mockLinks[0]] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    )

    // Ensure clipboard.writeText exists (jsdom may not provide it)
    if (!navigator.clipboard) {
      Object.defineProperty(window.navigator, 'clipboard', {
        value: { writeText: vi.fn().mockResolvedValue(undefined) },
        configurable: true,
      })
    } else if (!navigator.clipboard.writeText) {
      navigator.clipboard.writeText = vi.fn().mockResolvedValue(undefined) as typeof navigator.clipboard.writeText
    }

    const user = userEvent.setup()
    render(<ShareModal isOpen={true} onClose={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Copy')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Copy'))

    // After clicking Copy, the copyLink handler runs and button text changes to "Copied!"
    await waitFor(() => {
      expect(screen.getByText('Copied!')).toBeInTheDocument()
    })
  })

  it('disables a link when Disable button is clicked', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [mockLinks[0]] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      )

    const user = userEvent.setup()
    render(<ShareModal isOpen={true} onClose={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('Disable')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Disable'))

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/workspaces/ws-1/share-links/link-1',
      expect.objectContaining({ method: 'DELETE' })
    )
  })
})
