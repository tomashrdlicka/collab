import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'

// ─── Mocks ──────────────────────────────────────────────────────────────────

// Mock keychain
vi.mock('../auth/keychain', () => ({
  getToken: vi.fn(),
  storeToken: vi.fn(),
  storeUser: vi.fn(),
  getUser: vi.fn(),
  removeToken: vi.fn(),
  removeUser: vi.fn(),
  isAuthenticated: vi.fn(),
}))

// Mock config
vi.mock('../auth/config', () => ({
  getApiUrl: vi.fn().mockReturnValue('http://localhost:3000'),
  getWsUrl: vi.fn().mockReturnValue('ws://localhost:1234'),
  findWorkspaceConfig: vi.fn(),
  getWorkspaceConfig: vi.fn(),
  setWorkspaceConfig: vi.fn(),
  createLocalConfig: vi.fn(),
}))

// Mock open
vi.mock('open', () => ({
  default: vi.fn(),
}))

// Mock ora spinner
const mockSpinner = {
  start: vi.fn().mockReturnThis(),
  stop: vi.fn(),
  succeed: vi.fn(),
  fail: vi.fn(),
  set text(_value: string) {
    // no-op
  },
}
vi.mock('ora', () => ({
  default: vi.fn(() => mockSpinner),
}))

// Mock inquirer
vi.mock('inquirer', () => ({
  default: {
    prompt: vi.fn(),
  },
}))

// Mock sync client (for watch command)
vi.mock('../sync/client', () => ({
  createSyncClient: vi.fn(),
}))

// ─── Imports (after mocks) ──────────────────────────────────────────────────

import { getToken, storeToken, storeUser, getUser, removeToken, removeUser, isAuthenticated } from '../auth/keychain'
import { getApiUrl, findWorkspaceConfig, getWorkspaceConfig, setWorkspaceConfig, createLocalConfig } from '../auth/config'
import openUrl from 'open'
import inquirer from 'inquirer'
import { createSyncClient } from '../sync/client'

import { loginCommand } from '../commands/login'
import { logoutCommand } from '../commands/logout'
import { whoamiCommand } from '../commands/whoami'
import { initCommand } from '../commands/init'
import { statusCommand } from '../commands/status'
import { commitCommand } from '../commands/commit'
import { openCommand } from '../commands/open'
import { watchCommand } from '../commands/watch'

// ─── Helpers ────────────────────────────────────────────────────────────────

const mockWorkspaceConfig = {
  workspaceId: 'ws-1',
  workspaceName: 'Test Workspace',
  workspaceSlug: 'test-workspace',
  localPath: '/home/user/project',
}

function mockFetchResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
    headers: new Headers(),
    redirected: false,
    statusText: ok ? 'OK' : 'Error',
    type: 'basic',
    url: '',
    clone: vi.fn(),
    body: null,
    bodyUsed: false,
    arrayBuffer: vi.fn(),
    blob: vi.fn(),
    formData: vi.fn(),
    text: vi.fn(),
    bytes: vi.fn(),
  } as unknown as Response
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(process, 'exit').mockImplementation((code?: number | string | null | undefined) => {
    throw new Error(`process.exit(${code})`)
  })
  global.fetch = vi.fn()

  // Reset spinner mocks
  mockSpinner.start.mockReturnThis()

  // Default mock return values
  ;(getApiUrl as Mock).mockReturnValue('http://localhost:3000')
})

// ─── login ──────────────────────────────────────────────────────────────────

describe('loginCommand', () => {
  it('shows warning and returns early when already logged in', async () => {
    ;(getToken as Mock).mockResolvedValue('existing-token')

    await loginCommand()

    expect(getToken).toHaveBeenCalled()
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Already logged in')
    )
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('starts auth flow and polls until completion', async () => {
    ;(getToken as Mock).mockResolvedValue(null)
    ;(storeToken as Mock).mockResolvedValue(undefined)
    ;(storeUser as Mock).mockResolvedValue(undefined)

    const startResponse = mockFetchResponse({
      code: 'ABC123',
      authUrl: 'http://localhost:3000/login?cli_code=ABC123',
      expiresAt: new Date(Date.now() + 300000).toISOString(),
    })

    const pendingResponse = mockFetchResponse({ status: 'pending' })
    const completedResponse = mockFetchResponse({
      status: 'completed',
      token: 'new-token',
      userId: 'user-1',
      username: 'testuser',
    })

    ;(global.fetch as Mock)
      .mockResolvedValueOnce(startResponse)
      .mockResolvedValueOnce(pendingResponse)
      .mockResolvedValueOnce(completedResponse)

    await loginCommand()

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/cli/auth/start',
      expect.objectContaining({ method: 'POST' })
    )
    expect(openUrl).toHaveBeenCalledWith('http://localhost:3000/login?cli_code=ABC123')
    expect(storeToken).toHaveBeenCalledWith('new-token')
    expect(storeUser).toHaveBeenCalledWith({ id: 'user-1', username: 'testuser' })
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('testuser'))
  })

  it('handles start auth failure', async () => {
    ;(getToken as Mock).mockResolvedValue(null)

    const failedResponse = mockFetchResponse({}, false, 500)
    ;(global.fetch as Mock).mockResolvedValueOnce(failedResponse)

    await expect(loginCommand()).rejects.toThrow('process.exit(1)')
    expect(mockSpinner.fail).toHaveBeenCalledWith('Authentication failed')
  })

  it('handles expired poll response', async () => {
    ;(getToken as Mock).mockResolvedValue(null)

    const startResponse = mockFetchResponse({
      code: 'ABC123',
      authUrl: 'http://localhost:3000/login?cli_code=ABC123',
      expiresAt: new Date(Date.now() + 300000).toISOString(),
    })

    const expiredResponse = mockFetchResponse({ status: 'expired' })

    ;(global.fetch as Mock)
      .mockResolvedValueOnce(startResponse)
      .mockResolvedValueOnce(expiredResponse)

    await expect(loginCommand()).rejects.toThrow('process.exit(1)')
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('expired')
    )
  })

  it('handles 404 during polling', async () => {
    ;(getToken as Mock).mockResolvedValue(null)

    const startResponse = mockFetchResponse({
      code: 'ABC123',
      authUrl: 'http://localhost:3000/login?cli_code=ABC123',
      expiresAt: new Date(Date.now() + 300000).toISOString(),
    })

    const notFoundResponse = mockFetchResponse({}, false, 404)

    ;(global.fetch as Mock)
      .mockResolvedValueOnce(startResponse)
      .mockResolvedValueOnce(notFoundResponse)

    await expect(loginCommand()).rejects.toThrow('process.exit(1)')
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('expired')
    )
  })

  it('handles network error during auth', async () => {
    ;(getToken as Mock).mockResolvedValue(null)

    ;(global.fetch as Mock).mockRejectedValueOnce(new Error('Network error'))

    await expect(loginCommand()).rejects.toThrow('process.exit(1)')
    expect(mockSpinner.fail).toHaveBeenCalledWith('Authentication failed')
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Network error')
    )
  })
})

// ─── logout ─────────────────────────────────────────────────────────────────

describe('logoutCommand', () => {
  it('clears credentials and shows username when logged in', async () => {
    ;(getUser as Mock).mockResolvedValue({ id: 'user-1', username: 'testuser' })
    ;(removeToken as Mock).mockResolvedValue(true)
    ;(removeUser as Mock).mockResolvedValue(true)

    await logoutCommand()

    expect(removeToken).toHaveBeenCalled()
    expect(removeUser).toHaveBeenCalled()
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('testuser')
    )
  })

  it('shows not logged in message when no credentials', async () => {
    ;(getUser as Mock).mockResolvedValue(null)

    await logoutCommand()

    expect(removeToken).not.toHaveBeenCalled()
    expect(removeUser).not.toHaveBeenCalled()
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Not logged in')
    )
  })
})

// ─── whoami ─────────────────────────────────────────────────────────────────

describe('whoamiCommand', () => {
  it('shows username when authenticated', async () => {
    ;(isAuthenticated as Mock).mockResolvedValue(true)
    ;(getUser as Mock).mockResolvedValue({ id: 'user-1', username: 'testuser' })

    await whoamiCommand()

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('testuser')
    )
  })

  it('shows not logged in when not authenticated', async () => {
    ;(isAuthenticated as Mock).mockResolvedValue(false)

    await whoamiCommand()

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Not logged in')
    )
    expect(getUser).not.toHaveBeenCalled()
  })

  it('shows user info not found when authenticated but no user data', async () => {
    ;(isAuthenticated as Mock).mockResolvedValue(true)
    ;(getUser as Mock).mockResolvedValue(null)

    await whoamiCommand()

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('User info not found')
    )
  })
})

// ─── init ───────────────────────────────────────────────────────────────────

describe('initCommand', () => {
  it('exits when not authenticated', async () => {
    ;(isAuthenticated as Mock).mockResolvedValue(false)

    await expect(initCommand({})).rejects.toThrow('process.exit(1)')
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Not logged in')
    )
  })

  it('prompts for overwrite when already linked and user declines', async () => {
    ;(isAuthenticated as Mock).mockResolvedValue(true)
    ;(getWorkspaceConfig as Mock).mockReturnValue(mockWorkspaceConfig)
    ;(inquirer.prompt as unknown as Mock).mockResolvedValue({ overwrite: false })

    await initCommand({})

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Already linked')
    )
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('fetches workspaces and links selected workspace via interactive prompt', async () => {
    ;(isAuthenticated as Mock).mockResolvedValue(true)
    ;(getWorkspaceConfig as Mock).mockReturnValue(null)
    ;(getToken as Mock).mockResolvedValue('test-token')

    const workspaces = [
      { id: 'ws-1', name: 'Workspace 1', slug: 'workspace-1', githubRepo: 'user/repo1' },
      { id: 'ws-2', name: 'Workspace 2', slug: 'workspace-2', githubRepo: 'user/repo2' },
    ]

    ;(global.fetch as Mock).mockResolvedValueOnce(
      mockFetchResponse({ data: workspaces })
    )

    ;(inquirer.prompt as unknown as Mock).mockResolvedValue({ workspace: workspaces[0] })

    await initCommand({})

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/workspaces',
      expect.objectContaining({
        headers: { Authorization: 'Bearer test-token' },
      })
    )
    expect(setWorkspaceConfig).toHaveBeenCalled()
    expect(createLocalConfig).toHaveBeenCalled()
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Linked')
    )
  })

  it('links workspace directly when workspace option is provided', async () => {
    ;(isAuthenticated as Mock).mockResolvedValue(true)
    ;(getWorkspaceConfig as Mock).mockReturnValue(null)
    ;(getToken as Mock).mockResolvedValue('test-token')

    const workspaces = [
      { id: 'ws-1', name: 'Workspace 1', slug: 'workspace-1', githubRepo: 'user/repo1' },
    ]

    ;(global.fetch as Mock).mockResolvedValueOnce(
      mockFetchResponse({ data: workspaces })
    )

    await initCommand({ workspace: 'workspace-1' })

    expect(inquirer.prompt).not.toHaveBeenCalled()
    expect(setWorkspaceConfig).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ workspaceId: 'ws-1' })
    )
  })

  it('exits when workspace option does not match any workspace', async () => {
    ;(isAuthenticated as Mock).mockResolvedValue(true)
    ;(getWorkspaceConfig as Mock).mockReturnValue(null)
    ;(getToken as Mock).mockResolvedValue('test-token')

    ;(global.fetch as Mock).mockResolvedValueOnce(
      mockFetchResponse({ data: [{ id: 'ws-1', name: 'WS1', slug: 'ws-1', githubRepo: 'u/r' }] })
    )

    await expect(initCommand({ workspace: 'nonexistent' })).rejects.toThrow('process.exit(1)')
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('not found')
    )
  })

  it('shows message when no workspaces exist', async () => {
    ;(isAuthenticated as Mock).mockResolvedValue(true)
    ;(getWorkspaceConfig as Mock).mockReturnValue(null)
    ;(getToken as Mock).mockResolvedValue('test-token')

    ;(global.fetch as Mock).mockResolvedValueOnce(
      mockFetchResponse({ data: [] })
    )

    await initCommand({})

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('No workspaces found')
    )
    expect(setWorkspaceConfig).not.toHaveBeenCalled()
  })

  it('handles fetch error during workspace listing', async () => {
    ;(isAuthenticated as Mock).mockResolvedValue(true)
    ;(getWorkspaceConfig as Mock).mockReturnValue(null)
    ;(getToken as Mock).mockResolvedValue('test-token')

    ;(global.fetch as Mock).mockResolvedValueOnce(
      mockFetchResponse({}, false, 500)
    )

    await expect(initCommand({})).rejects.toThrow('process.exit(1)')
    expect(mockSpinner.fail).toHaveBeenCalledWith('Failed to initialize')
  })

  it('re-links when already linked and user confirms overwrite', async () => {
    ;(isAuthenticated as Mock).mockResolvedValue(true)
    ;(getWorkspaceConfig as Mock).mockReturnValue(mockWorkspaceConfig)
    ;(getToken as Mock).mockResolvedValue('test-token')
    ;(inquirer.prompt as unknown as Mock)
      .mockResolvedValueOnce({ overwrite: true })
      .mockResolvedValueOnce({ workspace: { id: 'ws-2', name: 'WS2', slug: 'ws-2' } })

    const workspaces = [
      { id: 'ws-2', name: 'WS2', slug: 'ws-2', githubRepo: 'user/repo2' },
    ]
    ;(global.fetch as Mock).mockResolvedValueOnce(
      mockFetchResponse({ data: workspaces })
    )

    await initCommand({})

    expect(setWorkspaceConfig).toHaveBeenCalled()
  })
})

// ─── status ─────────────────────────────────────────────────────────────────

describe('statusCommand', () => {
  it('exits when not authenticated', async () => {
    ;(isAuthenticated as Mock).mockResolvedValue(false)

    await expect(statusCommand()).rejects.toThrow('process.exit(1)')
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Not logged in')
    )
  })

  it('exits when not linked to a workspace', async () => {
    ;(isAuthenticated as Mock).mockResolvedValue(true)
    ;(findWorkspaceConfig as Mock).mockReturnValue(null)

    await expect(statusCommand()).rejects.toThrow('process.exit(1)')
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Not linked')
    )
  })

  it('shows uncommitted changes list', async () => {
    ;(isAuthenticated as Mock).mockResolvedValue(true)
    ;(findWorkspaceConfig as Mock).mockReturnValue(mockWorkspaceConfig)
    ;(getToken as Mock).mockResolvedValue('test-token')

    const changes = [
      { changeType: 'create', documentPath: 'docs/new.md' },
      { changeType: 'update', documentPath: 'docs/existing.md' },
      { changeType: 'delete', documentPath: 'docs/removed.md' },
    ]

    ;(global.fetch as Mock).mockResolvedValueOnce(
      mockFetchResponse({ data: changes })
    )

    await statusCommand()

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/workspaces/ws-1/changes/uncommitted',
      expect.objectContaining({
        headers: { Authorization: 'Bearer test-token' },
      })
    )
    expect(mockSpinner.stop).toHaveBeenCalled()
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('3 uncommitted changes')
    )
  })

  it('shows no changes message when empty', async () => {
    ;(isAuthenticated as Mock).mockResolvedValue(true)
    ;(findWorkspaceConfig as Mock).mockReturnValue(mockWorkspaceConfig)
    ;(getToken as Mock).mockResolvedValue('test-token')

    ;(global.fetch as Mock).mockResolvedValueOnce(
      mockFetchResponse({ data: [] })
    )

    await statusCommand()

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('No uncommitted changes')
    )
  })

  it('shows singular change text for one change', async () => {
    ;(isAuthenticated as Mock).mockResolvedValue(true)
    ;(findWorkspaceConfig as Mock).mockReturnValue(mockWorkspaceConfig)
    ;(getToken as Mock).mockResolvedValue('test-token')

    ;(global.fetch as Mock).mockResolvedValueOnce(
      mockFetchResponse({ data: [{ changeType: 'update', documentPath: 'readme.md' }] })
    )

    await statusCommand()

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('1 uncommitted change:')
    )
  })

  it('handles fetch error', async () => {
    ;(isAuthenticated as Mock).mockResolvedValue(true)
    ;(findWorkspaceConfig as Mock).mockReturnValue(mockWorkspaceConfig)
    ;(getToken as Mock).mockResolvedValue('test-token')

    ;(global.fetch as Mock).mockResolvedValueOnce(
      mockFetchResponse({}, false, 500)
    )

    await expect(statusCommand()).rejects.toThrow('process.exit(1)')
    expect(mockSpinner.fail).toHaveBeenCalledWith('Failed to fetch status')
  })
})

// ─── commit ─────────────────────────────────────────────────────────────────

describe('commitCommand', () => {
  it('exits when not authenticated', async () => {
    ;(isAuthenticated as Mock).mockResolvedValue(false)

    await expect(commitCommand({})).rejects.toThrow('process.exit(1)')
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Not logged in')
    )
  })

  it('exits when not linked to a workspace', async () => {
    ;(isAuthenticated as Mock).mockResolvedValue(true)
    ;(findWorkspaceConfig as Mock).mockReturnValue(null)

    await expect(commitCommand({})).rejects.toThrow('process.exit(1)')
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Not linked')
    )
  })

  it('commits successfully and shows SHA and details', async () => {
    ;(isAuthenticated as Mock).mockResolvedValue(true)
    ;(findWorkspaceConfig as Mock).mockReturnValue(mockWorkspaceConfig)
    ;(getToken as Mock).mockResolvedValue('test-token')

    const commitData = {
      sha: 'abc1234567890',
      message: 'Update documents',
      filesChanged: 3,
      url: 'https://github.com/user/repo/commit/abc1234567890',
    }

    ;(global.fetch as Mock).mockResolvedValueOnce(
      mockFetchResponse({ data: commitData })
    )

    await commitCommand({ message: 'Custom message' })

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/workspaces/ws-1/commit',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
        body: JSON.stringify({ message: 'Custom message' }),
      })
    )
    expect(mockSpinner.succeed).toHaveBeenCalledWith('Committed successfully!')
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('abc1234')
    )
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('3 changed')
    )
  })

  it('commits without custom message', async () => {
    ;(isAuthenticated as Mock).mockResolvedValue(true)
    ;(findWorkspaceConfig as Mock).mockReturnValue(mockWorkspaceConfig)
    ;(getToken as Mock).mockResolvedValue('test-token')

    ;(global.fetch as Mock).mockResolvedValueOnce(
      mockFetchResponse({
        data: { sha: 'def456', message: 'Auto commit', filesChanged: 1 },
      })
    )

    await commitCommand({})

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({ message: undefined }),
      })
    )
  })

  it('handles commit without GitHub URL', async () => {
    ;(isAuthenticated as Mock).mockResolvedValue(true)
    ;(findWorkspaceConfig as Mock).mockReturnValue(mockWorkspaceConfig)
    ;(getToken as Mock).mockResolvedValue('test-token')

    ;(global.fetch as Mock).mockResolvedValueOnce(
      mockFetchResponse({
        data: { sha: 'def456', message: 'Commit', filesChanged: 1 },
      })
    )

    await commitCommand({})

    // Should not log GitHub URL line
    const logCalls = (console.log as Mock).mock.calls
    const hasGitHubUrl = logCalls.some((call: unknown[]) =>
      String(call[0]).includes('View on GitHub')
    )
    expect(hasGitHubUrl).toBe(false)
  })

  it('handles API error response with error message', async () => {
    ;(isAuthenticated as Mock).mockResolvedValue(true)
    ;(findWorkspaceConfig as Mock).mockReturnValue(mockWorkspaceConfig)
    ;(getToken as Mock).mockResolvedValue('test-token')

    ;(global.fetch as Mock).mockResolvedValueOnce(
      mockFetchResponse(
        { error: { message: 'No changes to commit' } },
        false,
        400
      )
    )

    await expect(commitCommand({})).rejects.toThrow('process.exit(1)')
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('No changes to commit')
    )
  })

  it('handles API error response without message', async () => {
    ;(isAuthenticated as Mock).mockResolvedValue(true)
    ;(findWorkspaceConfig as Mock).mockReturnValue(mockWorkspaceConfig)
    ;(getToken as Mock).mockResolvedValue('test-token')

    ;(global.fetch as Mock).mockResolvedValueOnce(
      mockFetchResponse({}, false, 500)
    )

    await expect(commitCommand({})).rejects.toThrow('process.exit(1)')
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Failed to commit')
    )
  })
})

// ─── open ───────────────────────────────────────────────────────────────────

describe('openCommand', () => {
  it('exits when not authenticated', async () => {
    ;(isAuthenticated as Mock).mockResolvedValue(false)

    await expect(openCommand()).rejects.toThrow('process.exit(1)')
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Not logged in')
    )
  })

  it('exits when not linked to a workspace', async () => {
    ;(isAuthenticated as Mock).mockResolvedValue(true)
    ;(findWorkspaceConfig as Mock).mockReturnValue(null)

    await expect(openCommand()).rejects.toThrow('process.exit(1)')
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Not linked')
    )
  })

  it('opens the correct workspace URL in browser', async () => {
    ;(isAuthenticated as Mock).mockResolvedValue(true)
    ;(findWorkspaceConfig as Mock).mockReturnValue(mockWorkspaceConfig)

    await openCommand()

    expect(openUrl).toHaveBeenCalledWith('http://localhost:3000/w/test-workspace')
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Opening')
    )
  })
})

// ─── watch ──────────────────────────────────────────────────────────────────

describe('watchCommand', () => {
  it('exits when not authenticated', async () => {
    ;(isAuthenticated as Mock).mockResolvedValue(false)

    await expect(watchCommand({})).rejects.toThrow('process.exit(1)')
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Not logged in')
    )
  })

  it('exits when not linked to a workspace', async () => {
    ;(isAuthenticated as Mock).mockResolvedValue(true)
    ;(findWorkspaceConfig as Mock).mockReturnValue(null)

    await expect(watchCommand({})).rejects.toThrow('process.exit(1)')
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Not linked')
    )
  })

  it('exits when token or user is missing', async () => {
    ;(isAuthenticated as Mock).mockResolvedValue(true)
    ;(findWorkspaceConfig as Mock).mockReturnValue(mockWorkspaceConfig)
    ;(getToken as Mock).mockResolvedValue(null)
    ;(getUser as Mock).mockResolvedValue(null)

    await expect(watchCommand({})).rejects.toThrow('process.exit(1)')
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Authentication error')
    )
  })

  it('creates sync client and starts watching', async () => {
    ;(isAuthenticated as Mock).mockResolvedValue(true)
    ;(findWorkspaceConfig as Mock).mockReturnValue(mockWorkspaceConfig)
    ;(getToken as Mock).mockResolvedValue('test-token')
    ;(getUser as Mock).mockResolvedValue({ id: 'user-1', username: 'testuser' })

    const mockClient = {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
    }
    ;(createSyncClient as Mock).mockResolvedValue(mockClient)

    await watchCommand({})

    expect(createSyncClient).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 'ws-1',
        localPath: '/home/user/project',
        token: 'test-token',
        userId: 'user-1',
        userName: 'testuser',
      })
    )
    expect(mockClient.start).toHaveBeenCalled()
  })

  it('handles sync client creation failure', async () => {
    ;(isAuthenticated as Mock).mockResolvedValue(true)
    ;(findWorkspaceConfig as Mock).mockReturnValue(mockWorkspaceConfig)
    ;(getToken as Mock).mockResolvedValue('test-token')
    ;(getUser as Mock).mockResolvedValue({ id: 'user-1', username: 'testuser' })

    ;(createSyncClient as Mock).mockRejectedValue(new Error('Connection refused'))

    await expect(watchCommand({})).rejects.toThrow('process.exit(1)')
    expect(mockSpinner.fail).toHaveBeenCalledWith('Failed to start')
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Connection refused')
    )
  })
})
