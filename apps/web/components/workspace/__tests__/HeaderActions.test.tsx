import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HeaderActions } from '../HeaderActions'

// Mock the workspace provider
const mockUseWorkspace = vi.fn()
vi.mock('@/app/w/[slug]/workspace-provider', () => ({
  useWorkspace: () => mockUseWorkspace(),
}))

// Mock ShareModal to avoid its internal fetch calls
vi.mock('../ShareModal', () => ({
  ShareModal: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) =>
    isOpen ? <div data-testid="share-modal"><button onClick={onClose}>Close modal</button></div> : null,
}))

function mockWorkspaceContext(role: 'owner' | 'editor' | 'viewer') {
  mockUseWorkspace.mockReturnValue({
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
      role,
    },
  })
}

describe('HeaderActions', () => {
  it('renders Share button for owners', () => {
    mockWorkspaceContext('owner')
    render(<HeaderActions />)
    expect(screen.getByText('Share')).toBeInTheDocument()
  })

  it('renders Share button for editors', () => {
    mockWorkspaceContext('editor')
    render(<HeaderActions />)
    expect(screen.getByText('Share')).toBeInTheDocument()
  })

  it('renders nothing for viewers', () => {
    mockWorkspaceContext('viewer')
    const { container } = render(<HeaderActions />)
    expect(container.innerHTML).toBe('')
  })

  it('opens ShareModal when Share button is clicked', async () => {
    mockWorkspaceContext('owner')
    const user = userEvent.setup()
    render(<HeaderActions />)

    expect(screen.queryByTestId('share-modal')).not.toBeInTheDocument()

    await user.click(screen.getByText('Share'))

    expect(screen.getByTestId('share-modal')).toBeInTheDocument()
  })

  it('closes ShareModal when onClose is called', async () => {
    mockWorkspaceContext('owner')
    const user = userEvent.setup()
    render(<HeaderActions />)

    await user.click(screen.getByText('Share'))
    expect(screen.getByTestId('share-modal')).toBeInTheDocument()

    await user.click(screen.getByText('Close modal'))
    expect(screen.queryByTestId('share-modal')).not.toBeInTheDocument()
  })
})
