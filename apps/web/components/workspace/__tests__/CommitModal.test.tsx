import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CommitModal } from '../CommitModal'

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

describe('CommitModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: vi.fn(),
    uncommittedCount: 3,
    onCommitted: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <CommitModal {...defaultProps} isOpen={false} />
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders the modal title', () => {
    render(<CommitModal {...defaultProps} />)
    expect(screen.getByRole('heading', { name: 'Commit to GitHub' })).toBeInTheDocument()
  })

  it('displays the uncommitted count with singular form', () => {
    render(<CommitModal {...defaultProps} uncommittedCount={1} />)
    expect(screen.getByText(/1 uncommitted change will be committed to/)).toBeInTheDocument()
  })

  it('displays the uncommitted count with plural form', () => {
    render(<CommitModal {...defaultProps} uncommittedCount={5} />)
    expect(screen.getByText(/5 uncommitted changes will be committed to/)).toBeInTheDocument()
  })

  it('displays the target repo name', () => {
    render(<CommitModal {...defaultProps} />)
    expect(screen.getByText('user/repo')).toBeInTheDocument()
  })

  it('has a commit message input', () => {
    render(<CommitModal {...defaultProps} />)
    const input = screen.getByPlaceholderText('Auto-generated if empty')
    expect(input).toBeInTheDocument()
  })

  it('renders commit button', () => {
    render(<CommitModal {...defaultProps} />)
    expect(screen.getByRole('button', { name: 'Commit to GitHub' })).toBeInTheDocument()
  })

  it('calls onClose when X button is clicked', async () => {
    const user = userEvent.setup()
    render(<CommitModal {...defaultProps} />)

    await user.click(screen.getByText('X'))
    expect(defaultProps.onClose).toHaveBeenCalled()
  })

  it('calls onClose when backdrop is clicked', async () => {
    const user = userEvent.setup()
    const { container } = render(<CommitModal {...defaultProps} />)

    // The backdrop is the first child div with bg-black/50 class
    const backdrop = container.querySelector('.bg-black\\/50')
    if (backdrop) {
      await user.click(backdrop)
    }
    expect(defaultProps.onClose).toHaveBeenCalled()
  })

  it('shows loading state during commit', async () => {
    const user = userEvent.setup()
    // Mock a fetch that never resolves during the test
    let resolvePromise: (value: Response) => void
    vi.spyOn(global, 'fetch').mockReturnValue(
      new Promise<Response>((resolve) => { resolvePromise = resolve })
    )

    render(<CommitModal {...defaultProps} />)

    await user.click(screen.getByRole('button', { name: 'Commit to GitHub' }))

    expect(screen.getByText('Committing...')).toBeInTheDocument()

    // Resolve to avoid unhandled promise
    resolvePromise!(new Response(JSON.stringify({ data: { sha: 'abc', url: 'https://example.com' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
  })

  it('shows success state after successful commit', async () => {
    const user = userEvent.setup()
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { sha: 'abc1234567890', url: 'https://github.com/commit/abc' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    render(<CommitModal {...defaultProps} />)

    await user.click(screen.getByRole('button', { name: 'Commit to GitHub' }))

    await waitFor(() => {
      expect(screen.getByText('Committed successfully!')).toBeInTheDocument()
    })

    // Shows truncated SHA
    expect(screen.getByText('abc1234')).toBeInTheDocument()

    // Shows "View on GitHub" link
    expect(screen.getByText('View on GitHub')).toBeInTheDocument()

    // onCommitted was called
    expect(defaultProps.onCommitted).toHaveBeenCalled()
  })

  it('shows error state when commit fails with API error', async () => {
    const user = userEvent.setup()
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'No GitHub token configured' } }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    render(<CommitModal {...defaultProps} />)

    await user.click(screen.getByRole('button', { name: 'Commit to GitHub' }))

    await waitFor(() => {
      expect(screen.getByText('No GitHub token configured')).toBeInTheDocument()
    })
  })

  it('shows error state when fetch throws', async () => {
    const user = userEvent.setup()
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'))

    render(<CommitModal {...defaultProps} />)

    await user.click(screen.getByRole('button', { name: 'Commit to GitHub' }))

    await waitFor(() => {
      expect(screen.getByText('Failed to commit to GitHub')).toBeInTheDocument()
    })
  })

  it('sends commit message in request body', async () => {
    const user = userEvent.setup()
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { sha: 'abc', url: 'https://example.com' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    render(<CommitModal {...defaultProps} />)

    const input = screen.getByPlaceholderText('Auto-generated if empty')
    await user.type(input, 'My commit message')
    await user.click(screen.getByRole('button', { name: 'Commit to GitHub' }))

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/workspaces/ws-1/commit',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ message: 'My commit message' }),
      })
    )
  })

  it('sends undefined message when input is empty', async () => {
    const user = userEvent.setup()
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { sha: 'abc', url: 'https://example.com' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    render(<CommitModal {...defaultProps} />)

    await user.click(screen.getByRole('button', { name: 'Commit to GitHub' }))

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/workspaces/ws-1/commit',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ message: undefined }),
      })
    )
  })

  it('shows Done button in success state that calls onClose', async () => {
    const user = userEvent.setup()
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: { sha: 'abc1234', url: 'https://example.com' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    render(<CommitModal {...defaultProps} />)
    await user.click(screen.getByRole('button', { name: 'Commit to GitHub' }))

    await waitFor(() => {
      expect(screen.getByText('Done')).toBeInTheDocument()
    })

    await user.click(screen.getByText('Done'))
    expect(defaultProps.onClose).toHaveBeenCalled()
  })

  it('disables input during loading', async () => {
    const user = userEvent.setup()
    let resolvePromise: (value: Response) => void
    vi.spyOn(global, 'fetch').mockReturnValue(
      new Promise<Response>((resolve) => { resolvePromise = resolve })
    )

    render(<CommitModal {...defaultProps} />)
    await user.click(screen.getByRole('button', { name: 'Commit to GitHub' }))

    const input = screen.getByPlaceholderText('Auto-generated if empty')
    expect(input).toBeDisabled()

    resolvePromise!(new Response(JSON.stringify({ data: { sha: 'abc', url: 'https://example.com' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
  })
})
