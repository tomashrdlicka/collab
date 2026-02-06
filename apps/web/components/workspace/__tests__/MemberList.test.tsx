import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemberList } from '../MemberList'

const mockMembers = [
  {
    userId: 'user-1',
    role: 'owner',
    githubUsername: 'owner-user',
    githubAvatarUrl: 'https://example.com/avatar1.png',
    joinedAt: '2024-01-01T00:00:00Z',
  },
  {
    userId: 'user-2',
    role: 'editor',
    githubUsername: 'editor-user',
    githubAvatarUrl: null,
    joinedAt: '2024-01-10T00:00:00Z',
  },
  {
    userId: 'user-3',
    role: 'viewer',
    githubUsername: 'viewer-user',
    githubAvatarUrl: 'https://example.com/avatar3.png',
    joinedAt: '2024-01-15T00:00:00Z',
  },
]

describe('MemberList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows loading state initially', () => {
    vi.spyOn(global, 'fetch').mockReturnValue(new Promise(() => {}))
    render(<MemberList workspaceId="ws-1" isOwner={false} />)
    expect(screen.getByText('Loading members...')).toBeInTheDocument()
  })

  it('fetches and displays members', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: mockMembers }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    )

    render(<MemberList workspaceId="ws-1" isOwner={false} />)

    await waitFor(() => {
      expect(screen.getByText('@owner-user')).toBeInTheDocument()
      expect(screen.getByText('@editor-user')).toBeInTheDocument()
      expect(screen.getByText('@viewer-user')).toBeInTheDocument()
    })
  })

  it('displays member roles with correct badges', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: mockMembers }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    )

    render(<MemberList workspaceId="ws-1" isOwner={false} />)

    await waitFor(() => {
      expect(screen.getByText('owner')).toBeInTheDocument()
      expect(screen.getByText('editor')).toBeInTheDocument()
      expect(screen.getByText('viewer')).toBeInTheDocument()
    })
  })

  it('renders avatar image when githubAvatarUrl is present', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: [mockMembers[0]] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    )

    render(<MemberList workspaceId="ws-1" isOwner={false} />)

    await waitFor(() => {
      const img = screen.getByAltText('owner-user')
      expect(img).toBeInTheDocument()
      expect(img.getAttribute('src')).toBe('https://example.com/avatar1.png')
    })
  })

  it('renders fallback initial when no avatar URL', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: [mockMembers[1]] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    )

    render(<MemberList workspaceId="ws-1" isOwner={false} />)

    await waitFor(() => {
      expect(screen.getByText('E')).toBeInTheDocument() // First char of 'editor-user' uppercased
    })
  })

  it('does not show role dropdown or remove button for non-owners', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: mockMembers }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    )

    render(<MemberList workspaceId="ws-1" isOwner={false} />)

    await waitFor(() => {
      expect(screen.getByText('@owner-user')).toBeInTheDocument()
    })

    // No Remove buttons
    expect(screen.queryByText('Remove')).not.toBeInTheDocument()
    // No Add Member form
    expect(screen.queryByText('Add Member')).not.toBeInTheDocument()
  })

  it('shows role dropdown and remove button for non-owner members when user is owner', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: mockMembers }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    )

    render(<MemberList workspaceId="ws-1" isOwner={true} />)

    await waitFor(() => {
      expect(screen.getByText('@editor-user')).toBeInTheDocument()
    })

    // Should have Remove buttons for non-owner members (editor-user and viewer-user)
    const removeButtons = screen.getAllByText('Remove')
    expect(removeButtons).toHaveLength(2)
  })

  it('does not show role dropdown for the owner member even when user is owner', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: [mockMembers[0]] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    )

    render(<MemberList workspaceId="ws-1" isOwner={true} />)

    await waitFor(() => {
      expect(screen.getByText('@owner-user')).toBeInTheDocument()
    })

    // No Remove button for the owner
    expect(screen.queryByText('Remove')).not.toBeInTheDocument()
  })

  it('shows Add Member form for owners', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    )

    render(<MemberList workspaceId="ws-1" isOwner={true} />)

    await waitFor(() => {
      expect(screen.getByText('Add Member')).toBeInTheDocument()
      expect(screen.getByPlaceholderText('GitHub username')).toBeInTheDocument()
    })
  })

  it('adds a member via the form', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { userId: 'new-user' } }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: mockMembers }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      )

    const user = userEvent.setup()
    render(<MemberList workspaceId="ws-1" isOwner={true} />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('GitHub username')).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText('GitHub username')
    await user.type(input, 'new-member')
    await user.click(screen.getByText('Add'))

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/workspaces/ws-1/members',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ githubUsername: 'new-member', role: 'editor' }),
      })
    )
  })

  it('disables Add button when username is empty', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    )

    render(<MemberList workspaceId="ws-1" isOwner={true} />)

    await waitFor(() => {
      const addButton = screen.getByText('Add')
      expect(addButton).toBeDisabled()
    })
  })

  it('shows error when adding member fails', async () => {
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'User not found' } }), { status: 404, headers: { 'Content-Type': 'application/json' } })
      )

    const user = userEvent.setup()
    render(<MemberList workspaceId="ws-1" isOwner={true} />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('GitHub username')).toBeInTheDocument()
    })

    await user.type(screen.getByPlaceholderText('GitHub username'), 'unknown-user')
    await user.click(screen.getByText('Add'))

    await waitFor(() => {
      expect(screen.getByText('User not found')).toBeInTheDocument()
    })
  })

  it('shows generic error when add member fetch throws', async () => {
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      )
      .mockRejectedValueOnce(new Error('Network error'))

    const user = userEvent.setup()
    render(<MemberList workspaceId="ws-1" isOwner={true} />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('GitHub username')).toBeInTheDocument()
    })

    await user.type(screen.getByPlaceholderText('GitHub username'), 'some-user')
    await user.click(screen.getByText('Add'))

    await waitFor(() => {
      expect(screen.getByText('Failed to add member')).toBeInTheDocument()
    })
  })

  it('updates member role via dropdown', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: mockMembers }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: mockMembers }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      )

    const user = userEvent.setup()
    render(<MemberList workspaceId="ws-1" isOwner={true} />)

    await waitFor(() => {
      expect(screen.getByText('@editor-user')).toBeInTheDocument()
    })

    // Find the select for the editor member (first select in the list, not the "Add" form select)
    const selects = screen.getAllByDisplayValue('Editor')
    // Change editor-user role to viewer
    await user.selectOptions(selects[0]!, 'viewer')

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/workspaces/ws-1/members/user-2',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ role: 'viewer' }),
      })
    )
  })

  it('removes a member when Remove button is clicked', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: mockMembers }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [mockMembers[0]] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      )

    const user = userEvent.setup()
    render(<MemberList workspaceId="ws-1" isOwner={true} />)

    await waitFor(() => {
      expect(screen.getAllByText('Remove')).toHaveLength(2)
    })

    // Click first Remove button (editor-user)
    const removeButtons = screen.getAllByText('Remove')
    await user.click(removeButtons[0]!)

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/workspaces/ws-1/members/user-2',
      expect.objectContaining({ method: 'DELETE' })
    )
  })

  it('submits form on Enter key', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { userId: 'new' } }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      )

    const user = userEvent.setup()
    render(<MemberList workspaceId="ws-1" isOwner={true} />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText('GitHub username')).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText('GitHub username')
    await user.type(input, 'enter-user{Enter}')

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/workspaces/ws-1/members',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ githubUsername: 'enter-user', role: 'editor' }),
      })
    )
  })
})
