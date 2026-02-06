// User types
export interface User {
  id: string
  githubId: string
  githubUsername: string
  githubAvatarUrl: string | null
  email: string | null
  createdAt: Date
  updatedAt: Date
}

export type UserRole = 'owner' | 'editor' | 'viewer'

export interface WorkspaceMember {
  workspaceId: string
  userId: string
  role: UserRole
  createdAt: Date
  user?: User
}

// Workspace types
export interface Workspace {
  id: string
  name: string
  slug: string
  githubRepo: string
  githubBranch: string
  basePath: string
  ownerId: string

  // Commit settings
  autoCommitEnabled: boolean
  autoCommitIdleMinutes: number
  autoCommitMaxMinutes: number
  dailyCommitCount: number
  dailyCommitResetAt: Date

  // Last commit info
  lastCommitAt: Date | null
  lastCommitSha: string | null

  createdAt: Date
  updatedAt: Date

  // Relations
  owner?: User
  members?: WorkspaceMember[]
}

// Share link types
export type SharePermission = 'viewer' | 'editor'

export interface ShareLink {
  id: string
  workspaceId: string
  code: string
  permission: SharePermission
  requireGithub: boolean
  expiresAt: Date | null
  maxUses: number | null
  useCount: number
  createdBy: string
  disabledAt: Date | null
  createdAt: Date
}

// Document types
export interface Document {
  id: string
  workspaceId: string
  path: string
  yjsState: Uint8Array
  contentHash: string | null
  lastModifiedBy: string | null
  lastModifiedAt: Date
  createdAt: Date
}

export type ChangeType = 'create' | 'update' | 'delete'
export type UserType = 'human' | 'agent' | 'system'

export interface DocumentChange {
  id: string
  documentId: string
  workspaceId: string
  userId: string | null
  userType: UserType
  agentName: string | null
  changeType: ChangeType
  sectionsAffected: string[]
  summary: string | null
  diffPreview: string | null
  committed: boolean
  commitSha: string | null
  createdAt: Date

  // Relations
  user?: User
  document?: Document
}

// Conflict types
export interface ConflictVersion {
  userId: string
  userName: string
  userType: UserType
  content: string
  timestamp: number
}

export interface Conflict {
  id: string
  documentId: string
  lineNumber: number
  versions: ConflictVersion[]
  resolvedAt: Date | null
  resolvedBy: string | null
  resolution: string | null
  createdAt: Date
}

// Integration types
export type IntegrationType = 'slack'

export interface SlackConfig {
  webhookUrl: string
  notifyAgentChanges: boolean
  notifyHumanChanges: boolean
  notifyCommits: boolean
  notifyCollaborators: boolean
  notifyConflicts: boolean
  frequency: 'immediate' | 'batched' | 'daily'
}

export interface WorkspaceIntegration {
  id: string
  workspaceId: string
  type: IntegrationType
  config: SlackConfig
  enabled: boolean
  createdAt: Date
  updatedAt: Date
}

// Presence types
export interface UserPresence {
  id: string
  name: string
  color: string
  type: UserType
  agentName?: string
  cursor: {
    anchor: number
    head: number
  } | null
}

// API response types
export interface ApiResponse<T> {
  data?: T
  error?: {
    code: string
    message: string
  }
}

export interface PaginatedResponse<T> {
  data: T[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

// WebSocket message types
export interface PresenceMessage {
  type: 'presence'
  users: UserPresence[]
}

export interface ConflictDetectedMessage {
  type: 'conflict'
  documentPath: string
  lineNumber: number
  versions: ConflictVersion[]
}

export interface ConflictResolvedMessage {
  type: 'conflict_resolved'
  documentPath: string
  lineNumber: number
  resolution: string
  resolvedBy: string
}

export interface ChangeNotificationMessage {
  type: 'change'
  documentPath: string
  userId: string
  userName: string
  userType: UserType
  changeType: ChangeType
  summary: string
}

export type CollabMessage =
  | PresenceMessage
  | ConflictDetectedMessage
  | ConflictResolvedMessage
  | ChangeNotificationMessage

// Import types
export interface ImportResult {
  imported: number
  skipped: number
  errors: number
  truncated: boolean
  files: Array<{
    path: string
    status: 'imported' | 'skipped' | 'error'
    reason?: string
  }>
}
