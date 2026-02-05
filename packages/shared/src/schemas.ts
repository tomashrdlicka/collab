import { z } from 'zod'

// Common schemas
export const slugSchema = z
  .string()
  .min(3)
  .max(50)
  .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens')

export const githubRepoSchema = z
  .string()
  .regex(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/, 'Must be in format owner/repo')

// Workspace schemas
export const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(100),
  githubRepo: githubRepoSchema,
  githubBranch: z.string().min(1).max(100).default('main'),
  basePath: z.string().max(200).default('/'),
})

export const updateWorkspaceSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  autoCommitEnabled: z.boolean().optional(),
  autoCommitIdleMinutes: z.number().min(1).max(60).optional(),
  autoCommitMaxMinutes: z.number().min(5).max(1440).optional(),
})

// Member schemas
export const roleSchema = z.enum(['owner', 'editor', 'viewer'])

export const addMemberSchema = z.object({
  githubUsername: z.string().min(1).max(100),
  role: roleSchema.default('editor'),
})

export const updateMemberSchema = z.object({
  role: roleSchema,
})

// Share link schemas
export const sharePermissionSchema = z.enum(['viewer', 'editor'])

export const createShareLinkSchema = z.object({
  permission: sharePermissionSchema.default('editor'),
  requireGithub: z.boolean().default(true),
  expiresAt: z.coerce.date().nullable().optional(),
  maxUses: z.number().min(1).nullable().optional(),
})

// Integration schemas
export const slackConfigSchema = z.object({
  webhookUrl: z.string().url().startsWith('https://hooks.slack.com/'),
  notifyAgentChanges: z.boolean().default(true),
  notifyHumanChanges: z.boolean().default(true),
  notifyCommits: z.boolean().default(true),
  notifyCollaborators: z.boolean().default(true),
  notifyConflicts: z.boolean().default(false),
  frequency: z.enum(['immediate', 'batched', 'daily']).default('batched'),
})

// Document schemas
export const documentPathSchema = z
  .string()
  .min(1)
  .max(500)
  .regex(/^[^/].*\.md$/, 'Path must be a markdown file and not start with /')

// Commit schemas
export const manualCommitSchema = z.object({
  message: z.string().min(1).max(500).optional(),
})

// CLI auth schemas
export const cliAuthStartSchema = z.object({
  deviceName: z.string().min(1).max(100).optional(),
})

// Conflict resolution schemas
export const resolveConflictSchema = z.object({
  resolution: z.string(),
})

// Type exports from schemas
export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceSchema>
export type AddMemberInput = z.infer<typeof addMemberSchema>
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>
export type CreateShareLinkInput = z.infer<typeof createShareLinkSchema>
export type SlackConfigInput = z.infer<typeof slackConfigSchema>
export type ManualCommitInput = z.infer<typeof manualCommitSchema>
export type ResolveConflictInput = z.infer<typeof resolveConflictSchema>
