/**
 * Shared test helpers for API route integration tests.
 * Provides mock factories for session, database, and common test data.
 */

import { vi } from 'vitest'

// --- Mock session ---

export const mockSession = {
  user: { id: 'user-1', name: 'Test User', email: 'test@example.com', image: null },
  expires: '2099-01-01',
}

export const mockSessionOther = {
  user: { id: 'user-2', name: 'Other User', email: 'other@example.com', image: null },
  expires: '2099-01-01',
}

// --- Mock data ---

// Use ISO strings for dates so values survive JSON serialization in NextResponse.json()
const FIXED_DATE = '2024-01-15T12:00:00.000Z'

export const mockWorkspace = {
  id: 'ws-1',
  name: 'Test Workspace',
  slug: 'test-workspace',
  githubRepo: 'owner/repo',
  githubBranch: 'main',
  basePath: '/',
  ownerId: 'user-1',
  autoCommitEnabled: true,
  autoCommitIdleMinutes: 5,
  autoCommitMaxMinutes: 60,
  dailyCommitCount: 0,
  dailyCommitResetAt: FIXED_DATE,
  lastCommitAt: null,
  lastCommitSha: null,
  createdAt: FIXED_DATE,
  updatedAt: FIXED_DATE,
}

export const mockMembership = {
  workspaceId: 'ws-1',
  userId: 'user-2',
  role: 'editor' as const,
  createdAt: FIXED_DATE,
}

export const mockUser = {
  id: 'user-2',
  githubId: '12345',
  githubUsername: 'other-user',
  githubAvatarUrl: 'https://example.com/avatar.png',
  email: 'other@example.com',
  createdAt: FIXED_DATE,
  updatedAt: FIXED_DATE,
}

// --- Chainable DB mock builder ---

type ChainStep = 'select' | 'insert' | 'update' | 'delete'

interface ChainableMock {
  from: ReturnType<typeof vi.fn>
  where: ReturnType<typeof vi.fn>
  limit: ReturnType<typeof vi.fn>
  offset: ReturnType<typeof vi.fn>
  orderBy: ReturnType<typeof vi.fn>
  leftJoin: ReturnType<typeof vi.fn>
  innerJoin: ReturnType<typeof vi.fn>
  values: ReturnType<typeof vi.fn>
  set: ReturnType<typeof vi.fn>
  returning: ReturnType<typeof vi.fn>
  _resolve: (data: unknown) => void
}

/**
 * Creates a chainable mock that mimics Drizzle's query builder pattern.
 * All chain methods return the same object so calls like
 * db.select().from(t).where(c).limit(1) work correctly.
 *
 * Call _resolve(data) to set what the chain eventually returns (the awaited value).
 */
export function createChainMock(resolvedValue: unknown = []): ChainableMock {
  let result = resolvedValue

  const chain: ChainableMock = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
    offset: vi.fn(),
    orderBy: vi.fn(),
    leftJoin: vi.fn(),
    innerJoin: vi.fn(),
    values: vi.fn(),
    set: vi.fn(),
    returning: vi.fn(),
    _resolve: (data: unknown) => {
      result = data
    },
  }

  // Each method returns the chain itself and is thenable
  const handler: ProxyHandler<ChainableMock> = {
    get(target, prop) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => void) => resolve(result)
      }
      if (prop === '_resolve') {
        return target._resolve
      }
      const fn = target[prop as keyof ChainableMock]
      if (typeof fn === 'function' && prop !== '_resolve') {
        return (...args: unknown[]) => {
          ;(fn as (...a: unknown[]) => unknown)(...args)
          return proxy
        }
      }
      return fn
    },
  }

  const proxy = new Proxy(chain, handler)
  return proxy
}

/**
 * Creates a mock db object that tracks call sequences.
 * Use addChain() to enqueue return values for sequential db calls.
 * The mock supports select/insert/update/delete entrypoints.
 */
export function createMockDb() {
  const chains: ChainableMock[] = []
  let callIndex = 0

  function nextChain(fields?: unknown) {
    const chain = chains[callIndex]
    if (!chain) {
      // Return a default empty chain if not enough chains registered
      return createChainMock([])
    }
    callIndex++
    return chain
  }

  const db = {
    select: vi.fn().mockImplementation((fields?: unknown) => nextChain(fields)),
    insert: vi.fn().mockImplementation((table: unknown) => nextChain()),
    update: vi.fn().mockImplementation((table: unknown) => nextChain()),
    delete: vi.fn().mockImplementation((table: unknown) => nextChain()),
  }

  return {
    db,
    /** Queue a chain that will resolve to the given data. */
    addChain(resolvedValue: unknown = []) {
      const chain = createChainMock(resolvedValue)
      chains.push(chain)
      return chain
    },
    /** Reset chain index between tests. */
    reset() {
      callIndex = 0
      chains.length = 0
    },
  }
}

// --- Request helpers ---

export function jsonRequest(url: string, method: string, body?: unknown): Request {
  const init: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  }
  if (body !== undefined) {
    init.body = JSON.stringify(body)
  }
  return new Request(url, init)
}
