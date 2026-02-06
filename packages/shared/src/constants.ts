// Sync settings
export const SYNC_DEBOUNCE_MS = 300
export const RECONNECT_DELAY_MS = 1000
export const MAX_RECONNECT_DELAY_MS = 30000
export const RECONNECT_BACKOFF_MULTIPLIER = 1.5

// Commit settings
export const DEFAULT_IDLE_MINUTES = 5
export const DEFAULT_MAX_MINUTES = 60
export const MAX_DAILY_COMMITS = 100

// Conflict settings
export const CONFLICT_WINDOW_MS = 500

// File watching
export const FILE_WATCH_DEBOUNCE_MS = 300
export const FILE_WATCH_IGNORED = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/.next/**',
  '**/coverage/**',
]

// Presence colors (for cursors)
export const PRESENCE_COLORS = [
  '#FF6B6B', // Red
  '#4ECDC4', // Teal
  '#45B7D1', // Blue
  '#96CEB4', // Green
  '#FFEAA7', // Yellow
  '#DDA0DD', // Plum
  '#98D8C8', // Mint
  '#F7DC6F', // Gold
  '#BB8FCE', // Purple
  '#85C1E9', // Light Blue
]

// API paths
export const API_PATHS = {
  AUTH: {
    SESSION: '/api/auth/session',
    GITHUB: '/api/auth/github',
    LOGOUT: '/api/auth/logout',
  },
  CLI: {
    AUTH_START: '/api/cli/auth/start',
    AUTH_POLL: '/api/cli/auth/poll',
  },
  WORKSPACES: '/api/workspaces',
  WORKSPACE: (id: string) => `/api/workspaces/${id}`,
  MEMBERS: (id: string) => `/api/workspaces/${id}/members`,
  MEMBER: (id: string, userId: string) => `/api/workspaces/${id}/members/${userId}`,
  SHARE_LINKS: (id: string) => `/api/workspaces/${id}/share-links`,
  DOCUMENTS: (id: string) => `/api/workspaces/${id}/documents`,
  DOCUMENT: (id: string, path: string) => `/api/workspaces/${id}/documents/${encodeURIComponent(path)}`,
  CHANGES: (id: string) => `/api/workspaces/${id}/changes`,
  UNCOMMITTED: (id: string) => `/api/workspaces/${id}/changes/uncommitted`,
  COMMIT: (id: string) => `/api/workspaces/${id}/commit`,
  IMPORT: (id: string) => `/api/workspaces/${id}/import`,
  COMMITS: (id: string) => `/api/workspaces/${id}/commits`,
  INTEGRATIONS: (id: string) => `/api/workspaces/${id}/integrations`,
  SLACK: (id: string) => `/api/workspaces/${id}/integrations/slack`,
  JOIN: (code: string) => `/api/join/${code}`,
} as const

// WebSocket paths
export const WS_PATH = '/collab'

// Markdown section patterns
export const HEADING_PATTERN = /^(#{1,6})\s+(.+)$/gm
export const FRONTMATTER_PATTERN = /^---\n([\s\S]*?)\n---/

// Context markers for AI agents
export const CONTEXT_MARKERS = {
  ALWAYS_INCLUDE: '<!-- context: always -->',
  IF_RELEVANT: '<!-- context: if-relevant -->',
  PRIORITY: '<!-- context: priority -->',
  HUMAN_ONLY: '<!-- context: human-only -->',
} as const

// Error codes
export const ERROR_CODES = {
  // Auth errors
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  INVALID_TOKEN: 'INVALID_TOKEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',

  // Workspace errors
  WORKSPACE_NOT_FOUND: 'WORKSPACE_NOT_FOUND',
  WORKSPACE_SLUG_TAKEN: 'WORKSPACE_SLUG_TAKEN',
  NOT_WORKSPACE_MEMBER: 'NOT_WORKSPACE_MEMBER',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',

  // Document errors
  DOCUMENT_NOT_FOUND: 'DOCUMENT_NOT_FOUND',
  DOCUMENT_CONFLICT: 'DOCUMENT_CONFLICT',

  // Share link errors
  SHARE_LINK_NOT_FOUND: 'SHARE_LINK_NOT_FOUND',
  SHARE_LINK_EXPIRED: 'SHARE_LINK_EXPIRED',
  SHARE_LINK_MAX_USES: 'SHARE_LINK_MAX_USES',
  SHARE_LINK_DISABLED: 'SHARE_LINK_DISABLED',

  // GitHub errors
  GITHUB_API_ERROR: 'GITHUB_API_ERROR',
  GITHUB_REPO_NOT_FOUND: 'GITHUB_REPO_NOT_FOUND',
  GITHUB_PERMISSION_DENIED: 'GITHUB_PERMISSION_DENIED',

  // Rate limiting
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  DAILY_COMMIT_LIMIT: 'DAILY_COMMIT_LIMIT',

  // Validation
  VALIDATION_ERROR: 'VALIDATION_ERROR',

  // Server errors
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]
