import { describe, it, expect } from 'vitest'
import {
  slugSchema,
  githubRepoSchema,
  createWorkspaceSchema,
  updateWorkspaceSchema,
  roleSchema,
  addMemberSchema,
  updateMemberSchema,
  sharePermissionSchema,
  createShareLinkSchema,
  slackConfigSchema,
  documentPathSchema,
  manualCommitSchema,
  cliAuthStartSchema,
  resolveConflictSchema,
} from '../schemas'

describe('schemas', () => {
  describe('slugSchema', () => {
    it('accepts valid slugs', () => {
      expect(slugSchema.safeParse('my-workspace').success).toBe(true)
      expect(slugSchema.safeParse('abc').success).toBe(true)
      expect(slugSchema.safeParse('test-123-slug').success).toBe(true)
      expect(slugSchema.safeParse('a'.repeat(50)).success).toBe(true)
    })

    it('rejects slugs shorter than 3 characters', () => {
      expect(slugSchema.safeParse('ab').success).toBe(false)
      expect(slugSchema.safeParse('a').success).toBe(false)
      expect(slugSchema.safeParse('').success).toBe(false)
    })

    it('rejects slugs longer than 50 characters', () => {
      expect(slugSchema.safeParse('a'.repeat(51)).success).toBe(false)
    })

    it('rejects uppercase characters', () => {
      expect(slugSchema.safeParse('MySlug').success).toBe(false)
      expect(slugSchema.safeParse('UPPER').success).toBe(false)
    })

    it('rejects special characters', () => {
      expect(slugSchema.safeParse('my_slug').success).toBe(false)
      expect(slugSchema.safeParse('my slug').success).toBe(false)
      expect(slugSchema.safeParse('my.slug').success).toBe(false)
    })
  })

  describe('githubRepoSchema', () => {
    it('accepts valid owner/repo format', () => {
      expect(githubRepoSchema.safeParse('owner/repo').success).toBe(true)
      expect(githubRepoSchema.safeParse('my-org/my-repo').success).toBe(true)
      expect(githubRepoSchema.safeParse('user123/repo.js').success).toBe(true)
      expect(githubRepoSchema.safeParse('org_name/repo_name').success).toBe(true)
    })

    it('rejects missing slash', () => {
      expect(githubRepoSchema.safeParse('noslash').success).toBe(false)
    })

    it('rejects empty owner or repo', () => {
      expect(githubRepoSchema.safeParse('/repo').success).toBe(false)
      expect(githubRepoSchema.safeParse('owner/').success).toBe(false)
    })

    it('rejects multiple slashes', () => {
      expect(githubRepoSchema.safeParse('a/b/c').success).toBe(false)
    })
  })

  describe('createWorkspaceSchema', () => {
    it('accepts valid workspace creation input', () => {
      const result = createWorkspaceSchema.safeParse({
        name: 'My Workspace',
        githubRepo: 'owner/repo',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.githubBranch).toBe('main')
        expect(result.data.basePath).toBe('/')
      }
    })

    it('accepts all optional fields', () => {
      const result = createWorkspaceSchema.safeParse({
        name: 'Test',
        githubRepo: 'org/project',
        githubBranch: 'develop',
        basePath: '/docs',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.githubBranch).toBe('develop')
        expect(result.data.basePath).toBe('/docs')
      }
    })

    it('rejects empty name', () => {
      expect(
        createWorkspaceSchema.safeParse({
          name: '',
          githubRepo: 'owner/repo',
        }).success
      ).toBe(false)
    })

    it('rejects name longer than 100 characters', () => {
      expect(
        createWorkspaceSchema.safeParse({
          name: 'a'.repeat(101),
          githubRepo: 'owner/repo',
        }).success
      ).toBe(false)
    })

    it('rejects invalid github repo format', () => {
      expect(
        createWorkspaceSchema.safeParse({
          name: 'Test',
          githubRepo: 'invalid',
        }).success
      ).toBe(false)
    })

    it('rejects missing required fields', () => {
      expect(createWorkspaceSchema.safeParse({}).success).toBe(false)
      expect(createWorkspaceSchema.safeParse({ name: 'Test' }).success).toBe(false)
    })
  })

  describe('updateWorkspaceSchema', () => {
    it('accepts partial updates', () => {
      expect(updateWorkspaceSchema.safeParse({ name: 'New Name' }).success).toBe(true)
      expect(updateWorkspaceSchema.safeParse({ autoCommitEnabled: false }).success).toBe(true)
      expect(updateWorkspaceSchema.safeParse({ autoCommitIdleMinutes: 10 }).success).toBe(true)
      expect(updateWorkspaceSchema.safeParse({ autoCommitMaxMinutes: 120 }).success).toBe(true)
    })

    it('accepts empty object (all optional)', () => {
      expect(updateWorkspaceSchema.safeParse({}).success).toBe(true)
    })

    it('rejects autoCommitIdleMinutes outside range', () => {
      expect(updateWorkspaceSchema.safeParse({ autoCommitIdleMinutes: 0 }).success).toBe(false)
      expect(updateWorkspaceSchema.safeParse({ autoCommitIdleMinutes: 61 }).success).toBe(false)
    })

    it('rejects autoCommitMaxMinutes outside range', () => {
      expect(updateWorkspaceSchema.safeParse({ autoCommitMaxMinutes: 4 }).success).toBe(false)
      expect(updateWorkspaceSchema.safeParse({ autoCommitMaxMinutes: 1441 }).success).toBe(false)
    })

    it('accepts boundary values for autoCommitIdleMinutes', () => {
      expect(updateWorkspaceSchema.safeParse({ autoCommitIdleMinutes: 1 }).success).toBe(true)
      expect(updateWorkspaceSchema.safeParse({ autoCommitIdleMinutes: 60 }).success).toBe(true)
    })

    it('accepts boundary values for autoCommitMaxMinutes', () => {
      expect(updateWorkspaceSchema.safeParse({ autoCommitMaxMinutes: 5 }).success).toBe(true)
      expect(updateWorkspaceSchema.safeParse({ autoCommitMaxMinutes: 1440 }).success).toBe(true)
    })
  })

  describe('roleSchema', () => {
    it('accepts valid roles', () => {
      expect(roleSchema.safeParse('owner').success).toBe(true)
      expect(roleSchema.safeParse('editor').success).toBe(true)
      expect(roleSchema.safeParse('viewer').success).toBe(true)
    })

    it('rejects invalid roles', () => {
      expect(roleSchema.safeParse('admin').success).toBe(false)
      expect(roleSchema.safeParse('').success).toBe(false)
      expect(roleSchema.safeParse('OWNER').success).toBe(false)
    })
  })

  describe('addMemberSchema', () => {
    it('accepts valid member with default role', () => {
      const result = addMemberSchema.safeParse({ githubUsername: 'octocat' })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.role).toBe('editor')
      }
    })

    it('accepts explicit role', () => {
      const result = addMemberSchema.safeParse({
        githubUsername: 'user1',
        role: 'viewer',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.role).toBe('viewer')
      }
    })

    it('rejects empty username', () => {
      expect(addMemberSchema.safeParse({ githubUsername: '' }).success).toBe(false)
    })

    it('rejects username longer than 100 characters', () => {
      expect(addMemberSchema.safeParse({ githubUsername: 'a'.repeat(101) }).success).toBe(false)
    })
  })

  describe('updateMemberSchema', () => {
    it('accepts valid role update', () => {
      expect(updateMemberSchema.safeParse({ role: 'editor' }).success).toBe(true)
    })

    it('rejects missing role', () => {
      expect(updateMemberSchema.safeParse({}).success).toBe(false)
    })
  })

  describe('sharePermissionSchema', () => {
    it('accepts viewer and editor', () => {
      expect(sharePermissionSchema.safeParse('viewer').success).toBe(true)
      expect(sharePermissionSchema.safeParse('editor').success).toBe(true)
    })

    it('rejects owner', () => {
      expect(sharePermissionSchema.safeParse('owner').success).toBe(false)
    })
  })

  describe('createShareLinkSchema', () => {
    it('accepts defaults', () => {
      const result = createShareLinkSchema.safeParse({})
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.permission).toBe('editor')
        expect(result.data.requireGithub).toBe(true)
      }
    })

    it('accepts all fields', () => {
      const result = createShareLinkSchema.safeParse({
        permission: 'viewer',
        requireGithub: false,
        expiresAt: '2025-12-31T23:59:59Z',
        maxUses: 10,
      })
      expect(result.success).toBe(true)
    })

    it('accepts null expiresAt and maxUses', () => {
      const result = createShareLinkSchema.safeParse({
        expiresAt: null,
        maxUses: null,
      })
      expect(result.success).toBe(true)
    })

    it('rejects maxUses less than 1', () => {
      expect(createShareLinkSchema.safeParse({ maxUses: 0 }).success).toBe(false)
    })
  })

  describe('slackConfigSchema', () => {
    it('accepts valid slack config with defaults', () => {
      const result = slackConfigSchema.safeParse({
        webhookUrl: 'https://hooks.slack.com/services/T00/B00/abc123',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.notifyAgentChanges).toBe(true)
        expect(result.data.notifyHumanChanges).toBe(true)
        expect(result.data.notifyCommits).toBe(true)
        expect(result.data.notifyCollaborators).toBe(true)
        expect(result.data.notifyConflicts).toBe(false)
        expect(result.data.frequency).toBe('batched')
      }
    })

    it('rejects non-slack webhook URLs', () => {
      expect(
        slackConfigSchema.safeParse({
          webhookUrl: 'https://example.com/webhook',
        }).success
      ).toBe(false)
    })

    it('rejects invalid URL', () => {
      expect(
        slackConfigSchema.safeParse({
          webhookUrl: 'not-a-url',
        }).success
      ).toBe(false)
    })

    it('accepts custom frequency', () => {
      const result = slackConfigSchema.safeParse({
        webhookUrl: 'https://hooks.slack.com/services/T00/B00/abc',
        frequency: 'immediate',
      })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.frequency).toBe('immediate')
      }
    })

    it('rejects invalid frequency', () => {
      expect(
        slackConfigSchema.safeParse({
          webhookUrl: 'https://hooks.slack.com/services/T00/B00/abc',
          frequency: 'weekly',
        }).success
      ).toBe(false)
    })
  })

  describe('documentPathSchema', () => {
    it('accepts valid markdown paths', () => {
      expect(documentPathSchema.safeParse('readme.md').success).toBe(true)
      expect(documentPathSchema.safeParse('docs/guide.md').success).toBe(true)
      expect(documentPathSchema.safeParse('deep/nested/path/file.md').success).toBe(true)
    })

    it('rejects paths starting with /', () => {
      expect(documentPathSchema.safeParse('/readme.md').success).toBe(false)
    })

    it('rejects non-markdown files', () => {
      expect(documentPathSchema.safeParse('readme.txt').success).toBe(false)
      expect(documentPathSchema.safeParse('script.js').success).toBe(false)
    })

    it('rejects empty paths', () => {
      expect(documentPathSchema.safeParse('').success).toBe(false)
    })

    it('rejects paths longer than 500 characters', () => {
      expect(documentPathSchema.safeParse('a'.repeat(498) + '.md').success).toBe(false)
    })
  })

  describe('manualCommitSchema', () => {
    it('accepts empty object (optional message)', () => {
      expect(manualCommitSchema.safeParse({}).success).toBe(true)
    })

    it('accepts valid message', () => {
      const result = manualCommitSchema.safeParse({ message: 'Update docs' })
      expect(result.success).toBe(true)
    })

    it('rejects empty message', () => {
      expect(manualCommitSchema.safeParse({ message: '' }).success).toBe(false)
    })

    it('rejects message longer than 500 characters', () => {
      expect(manualCommitSchema.safeParse({ message: 'a'.repeat(501) }).success).toBe(false)
    })
  })

  describe('cliAuthStartSchema', () => {
    it('accepts empty object', () => {
      expect(cliAuthStartSchema.safeParse({}).success).toBe(true)
    })

    it('accepts device name', () => {
      expect(cliAuthStartSchema.safeParse({ deviceName: 'My Laptop' }).success).toBe(true)
    })

    it('rejects empty device name', () => {
      expect(cliAuthStartSchema.safeParse({ deviceName: '' }).success).toBe(false)
    })
  })

  describe('resolveConflictSchema', () => {
    it('accepts any resolution string', () => {
      expect(resolveConflictSchema.safeParse({ resolution: 'Use version A' }).success).toBe(true)
      expect(resolveConflictSchema.safeParse({ resolution: '' }).success).toBe(true)
    })

    it('rejects missing resolution', () => {
      expect(resolveConflictSchema.safeParse({}).success).toBe(false)
    })
  })
})
