import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { WorkspaceChanges } from '../workspace-changes'

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, className }: {
    children: React.ReactNode
    href: string
    className?: string
  }) => (
    <a href={href} className={className}>{children}</a>
  ),
}))

// Mock utils
vi.mock('@/lib/utils', () => ({
  formatRelativeTime: () => 'just now',
  getChangeTypeColor: () => 'text-green-500',
  getChangeTypeLabel: (type: string) => type,
  cn: (...classes: (string | boolean | undefined | null)[]) =>
    classes.filter(Boolean).join(' '),
}))

// Mock CommitButton
vi.mock('@/components/workspace/CommitButton', () => ({
  CommitButton: ({ uncommittedCount }: { uncommittedCount: number }) => (
    <button data-testid="commit-button">Commit {uncommittedCount} changes</button>
  ),
}))

// Mock DiffViewer
vi.mock('@/components/workspace/DiffViewer', () => ({
  DiffViewer: ({ diff }: { diff: string }) => (
    <pre data-testid="diff-viewer">{diff}</pre>
  ),
}))

const mockWorkspace = { id: 'ws-1', name: 'Test Workspace', githubRepo: 'owner/repo' }

describe('WorkspaceChanges', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders workspace name and repo', () => {
    render(
      <WorkspaceChanges
        workspace={mockWorkspace}
        changes={[]}
        slug="test-workspace"
      />
    )

    expect(screen.getByText('Test Workspace')).toBeInTheDocument()
    // "owner/repo" appears in header and import CTA
    expect(screen.getAllByText('owner/repo').length).toBeGreaterThanOrEqual(1)
  })

  it('shows import CTA in empty state', () => {
    render(
      <WorkspaceChanges
        workspace={mockWorkspace}
        changes={[]}
        slug="test-workspace"
      />
    )

    expect(screen.getByText('No files in this workspace yet.')).toBeInTheDocument()
    expect(screen.getByText('Import from GitHub')).toBeInTheDocument()
  })

  it('shows repo name in import CTA', () => {
    render(
      <WorkspaceChanges
        workspace={mockWorkspace}
        changes={[]}
        slug="test-workspace"
      />
    )

    // Repo name appears in header and in the import CTA
    const repoElements = screen.getAllByText('owner/repo')
    expect(repoElements.length).toBeGreaterThanOrEqual(2)
  })

  it('calls import API when import button is clicked', async () => {
    const user = userEvent.setup()
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        data: { imported: 3, skipped: 0, errors: 0, truncated: false, files: [] },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    )

    render(
      <WorkspaceChanges
        workspace={mockWorkspace}
        changes={[]}
        slug="test-workspace"
      />
    )

    await user.click(screen.getByText('Import from GitHub'))

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/api/workspaces/ws-1/import', {
        method: 'POST',
      })
    })
  })

  it('shows importing state during API call', async () => {
    const user = userEvent.setup()
    // Create a promise that won't resolve immediately
    vi.spyOn(global, 'fetch').mockReturnValue(new Promise(() => {}))

    render(
      <WorkspaceChanges
        workspace={mockWorkspace}
        changes={[]}
        slug="test-workspace"
      />
    )

    await user.click(screen.getByText('Import from GitHub'))

    expect(screen.getByText('Importing...')).toBeInTheDocument()
  })

  it('shows import result after successful import', async () => {
    const user = userEvent.setup()
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        data: { imported: 5, skipped: 2, errors: 1, truncated: false, files: [] },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    )

    render(
      <WorkspaceChanges
        workspace={mockWorkspace}
        changes={[]}
        slug="test-workspace"
      />
    )

    await user.click(screen.getByText('Import from GitHub'))

    await waitFor(() => {
      expect(screen.getByText('Imported 5 files')).toBeInTheDocument()
    })

    expect(screen.getByText('2 skipped (already exist)')).toBeInTheDocument()
    expect(screen.getByText('1 error')).toBeInTheDocument()
  })

  it('does not show import CTA when changes exist', () => {
    const changes = [{
      id: 'change-1',
      documentId: 'doc-1',
      userId: 'user-1',
      userType: 'human',
      agentName: null,
      changeType: 'update',
      summary: 'Updated content',
      diffPreview: null,
      committed: true,
      createdAt: new Date(),
      documentPath: 'README.md',
      userName: 'Test User',
    }]

    render(
      <WorkspaceChanges
        workspace={mockWorkspace}
        changes={changes}
        slug="test-workspace"
      />
    )

    expect(screen.queryByText('Import from GitHub')).not.toBeInTheDocument()
    expect(screen.queryByText('No files in this workspace yet.')).not.toBeInTheDocument()
  })

  it('renders committed changes', () => {
    const changes = [{
      id: 'change-1',
      documentId: 'doc-1',
      userId: 'user-1',
      userType: 'human',
      agentName: null,
      changeType: 'update',
      summary: 'Updated content',
      diffPreview: null,
      committed: true,
      createdAt: new Date(),
      documentPath: 'README.md',
      userName: 'Test User',
    }]

    render(
      <WorkspaceChanges
        workspace={mockWorkspace}
        changes={changes}
        slug="test-workspace"
      />
    )

    expect(screen.getByText('Test User')).toBeInTheDocument()
    expect(screen.getByText('README.md')).toBeInTheDocument()
  })

  it('renders uncommitted changes with badge', () => {
    const changes = [{
      id: 'change-1',
      documentId: 'doc-1',
      userId: 'user-1',
      userType: 'human',
      agentName: null,
      changeType: 'create',
      summary: null,
      diffPreview: null,
      committed: false,
      createdAt: new Date(),
      documentPath: 'new-file.md',
      userName: 'Test User',
    }]

    render(
      <WorkspaceChanges
        workspace={mockWorkspace}
        changes={changes}
        slug="test-workspace"
      />
    )

    expect(screen.getByText('uncommitted')).toBeInTheDocument()
    expect(screen.getByText('Uncommitted Changes (1)')).toBeInTheDocument()
  })

  it('handles import API error gracefully', async () => {
    const user = userEvent.setup()
    vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        error: { code: 'IMPORT_FAILED', message: 'Failed to import' },
      }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    )

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <WorkspaceChanges
        workspace={mockWorkspace}
        changes={[]}
        slug="test-workspace"
      />
    )

    await user.click(screen.getByText('Import from GitHub'))

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalled()
    })

    consoleSpy.mockRestore()
  })
})
