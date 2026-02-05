import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  date,
  customType,
  index,
  unique,
  primaryKey,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'

// Custom type for bytea
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea'
  },
})

// Custom type for text array
const textArray = customType<{ data: string[]; driverData: string[] }>({
  dataType() {
    return 'text[]'
  },
  toDriver(value: string[]): string[] {
    return value
  },
  fromDriver(value: string[]): string[] {
    return value
  },
})

// Users table
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  githubId: text('github_id').notNull().unique(),
  githubUsername: text('github_username').notNull(),
  githubAvatarUrl: text('github_avatar_url'),
  email: text('email'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// GitHub tokens table (separate for security)
export const githubTokens = pgTable('github_tokens', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  encryptedToken: bytea('encrypted_token').notNull(),
  tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// Workspaces table
export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  githubRepo: text('github_repo').notNull(),
  githubBranch: text('github_branch').default('main').notNull(),
  basePath: text('base_path').default('/').notNull(),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id),

  // Commit settings
  autoCommitEnabled: boolean('auto_commit_enabled').default(true).notNull(),
  autoCommitIdleMinutes: integer('auto_commit_idle_minutes').default(5).notNull(),
  autoCommitMaxMinutes: integer('auto_commit_max_minutes').default(60).notNull(),
  dailyCommitCount: integer('daily_commit_count').default(0).notNull(),
  dailyCommitResetAt: date('daily_commit_reset_at').defaultNow().notNull(),

  // Last commit info
  lastCommitAt: timestamp('last_commit_at', { withTimezone: true }),
  lastCommitSha: text('last_commit_sha'),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

// Workspace members table
export const workspaceMembers = pgTable(
  'workspace_members',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['owner', 'editor', 'viewer'] }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.workspaceId, table.userId] }),
    userIdx: index('idx_workspace_members_user').on(table.userId),
  })
)

// Share links table
export const shareLinks = pgTable(
  'share_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    code: text('code').notNull().unique(),
    permission: text('permission', { enum: ['viewer', 'editor'] }).notNull(),
    requireGithub: boolean('require_github').default(true).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    maxUses: integer('max_uses'),
    useCount: integer('use_count').default(0).notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    disabledAt: timestamp('disabled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    activeCodeIdx: index('idx_share_links_code').on(table.code),
  })
)

// Documents table
export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    yjsState: bytea('yjs_state').notNull(),
    contentHash: text('content_hash'),
    lastModifiedBy: uuid('last_modified_by').references(() => users.id),
    lastModifiedAt: timestamp('last_modified_at', { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    workspaceIdx: index('idx_documents_workspace').on(table.workspaceId),
    uniquePath: unique('documents_workspace_path').on(table.workspaceId, table.path),
  })
)

// Document changes table
export const documentChanges = pgTable(
  'document_changes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id),
    userType: text('user_type', { enum: ['human', 'agent', 'system'] }).notNull(),
    agentName: text('agent_name'),
    changeType: text('change_type', { enum: ['create', 'update', 'delete'] }).notNull(),
    sectionsAffected: textArray('sections_affected').default([]).notNull(),
    summary: text('summary'),
    diffPreview: text('diff_preview'),
    committed: boolean('committed').default(false).notNull(),
    commitSha: text('commit_sha'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    workspaceTimeIdx: index('idx_document_changes_workspace').on(table.workspaceId, table.createdAt),
    uncommittedIdx: index('idx_document_changes_uncommitted').on(table.workspaceId),
  })
)

// Conflicts table
export const conflicts = pgTable(
  'conflicts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    lineNumber: integer('line_number').notNull(),
    versions: text('versions').notNull(), // JSON string of ConflictVersion[]
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolvedBy: uuid('resolved_by').references(() => users.id),
    resolution: text('resolution'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    unresolvedIdx: index('idx_conflicts_unresolved').on(table.documentId),
  })
)

// Workspace integrations table
export const workspaceIntegrations = pgTable(
  'workspace_integrations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    type: text('type', { enum: ['slack'] }).notNull(),
    config: text('config').notNull(), // JSON string
    enabled: boolean('enabled').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueType: unique('workspace_integrations_workspace_type').on(table.workspaceId, table.type),
  })
)

// CLI auth codes table (for device auth flow)
export const cliAuthCodes = pgTable('cli_auth_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: text('code').notNull().unique(),
  deviceName: text('device_name'),
  userId: uuid('user_id').references(() => users.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

// Relations
export const usersRelations = relations(users, ({ one, many }) => ({
  githubToken: one(githubTokens, {
    fields: [users.id],
    references: [githubTokens.userId],
  }),
  ownedWorkspaces: many(workspaces),
  memberships: many(workspaceMembers),
  createdShareLinks: many(shareLinks),
  documentChanges: many(documentChanges),
}))

export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
  owner: one(users, {
    fields: [workspaces.ownerId],
    references: [users.id],
  }),
  members: many(workspaceMembers),
  shareLinks: many(shareLinks),
  documents: many(documents),
  changes: many(documentChanges),
  integrations: many(workspaceIntegrations),
}))

export const workspaceMembersRelations = relations(workspaceMembers, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [workspaceMembers.workspaceId],
    references: [workspaces.id],
  }),
  user: one(users, {
    fields: [workspaceMembers.userId],
    references: [users.id],
  }),
}))

export const shareLinksRelations = relations(shareLinks, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [shareLinks.workspaceId],
    references: [workspaces.id],
  }),
  creator: one(users, {
    fields: [shareLinks.createdBy],
    references: [users.id],
  }),
}))

export const documentsRelations = relations(documents, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [documents.workspaceId],
    references: [workspaces.id],
  }),
  lastModifier: one(users, {
    fields: [documents.lastModifiedBy],
    references: [users.id],
  }),
  changes: many(documentChanges),
  conflicts: many(conflicts),
}))

export const documentChangesRelations = relations(documentChanges, ({ one }) => ({
  document: one(documents, {
    fields: [documentChanges.documentId],
    references: [documents.id],
  }),
  workspace: one(workspaces, {
    fields: [documentChanges.workspaceId],
    references: [workspaces.id],
  }),
  user: one(users, {
    fields: [documentChanges.userId],
    references: [users.id],
  }),
}))

export const conflictsRelations = relations(conflicts, ({ one }) => ({
  document: one(documents, {
    fields: [conflicts.documentId],
    references: [documents.id],
  }),
  resolver: one(users, {
    fields: [conflicts.resolvedBy],
    references: [users.id],
  }),
}))

export const workspaceIntegrationsRelations = relations(workspaceIntegrations, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [workspaceIntegrations.workspaceId],
    references: [workspaces.id],
  }),
}))
