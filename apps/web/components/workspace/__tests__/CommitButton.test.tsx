import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CommitButton } from '../CommitButton'

// Mock the workspace provider (needed by CommitModal internally)
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

describe('CommitButton', () => {
  it('renders nothing when uncommittedCount is 0', () => {
    const { container } = render(
      <CommitButton uncommittedCount={0} />
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders singular text for 1 change', () => {
    render(<CommitButton uncommittedCount={1} />)
    expect(screen.getByText('Commit 1 change')).toBeInTheDocument()
  })

  it('renders plural text for multiple changes', () => {
    render(<CommitButton uncommittedCount={5} />)
    expect(screen.getByText('Commit 5 changes')).toBeInTheDocument()
  })

  it('opens CommitModal when clicked', async () => {
    const user = userEvent.setup()
    render(<CommitButton uncommittedCount={3} />)

    await user.click(screen.getByText('Commit 3 changes'))

    // CommitModal should be visible - it shows "Commit to GitHub" heading
    expect(screen.getByRole('heading', { name: 'Commit to GitHub' })).toBeInTheDocument()
  })

  it('calls onCommitted callback when commit modal triggers it', async () => {
    const onCommitted = vi.fn()
    const user = userEvent.setup()

    // Mock successful fetch
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ data: { sha: 'abc1234567', url: 'https://github.com/commit/abc1234567' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    )

    render(<CommitButton uncommittedCount={3} onCommitted={onCommitted} />)

    await user.click(screen.getByText('Commit 3 changes'))
    await user.click(screen.getByRole('button', { name: 'Commit to GitHub' }))

    // onCommitted is called by CommitModal on success, which triggers the
    // CommitButton's handler that calls setShowModal(false) and onCommitted
    expect(onCommitted).toHaveBeenCalled()

    vi.restoreAllMocks()
  })
})
