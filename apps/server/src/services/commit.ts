import type { Database } from '@collab/db'
import {
  workspaces,
  documents,
  documentChanges,
} from '@collab/db/schema'
import { eq, and, sql } from 'drizzle-orm'
import { getDocContent, decodeDocState } from '@collab/sync'
import { DEFAULT_IDLE_MINUTES, DEFAULT_MAX_MINUTES, MAX_DAILY_COMMITS } from '@collab/shared'
import { commitToGitHub } from './github'
import { notifyCommit } from './slack'
import Anthropic from '@anthropic-ai/sdk'

interface CommitService {
  start(): void
  stop(): void
  commitNow(workspaceId: string, message?: string): Promise<void>
}

interface PendingCommit {
  workspaceId: string
  lastActivity: number
  firstActivity: number
}

export function createCommitService(db: Database): CommitService {
  let interval: NodeJS.Timeout | null = null
  const pendingCommits = new Map<string, PendingCommit>()

  // Check every 30 seconds
  const CHECK_INTERVAL_MS = 30 * 1000

  async function checkAndCommit(): Promise<void> {
    const now = Date.now()

    // Get all workspaces with uncommitted changes
    const workspacesWithChanges = await db
      .selectDistinct({ workspaceId: documentChanges.workspaceId })
      .from(documentChanges)
      .where(eq(documentChanges.committed, false))

    for (const { workspaceId } of workspacesWithChanges) {
      // Get workspace settings
      const [workspace] = await db
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .limit(1)

      if (!workspace || !workspace.autoCommitEnabled) continue

      // Check daily commit limit
      const today = new Date().toISOString().split('T')[0]
      if (workspace.dailyCommitResetAt.toString() !== today) {
        // Reset daily count
        await db
          .update(workspaces)
          .set({
            dailyCommitCount: 0,
            dailyCommitResetAt: new Date().toISOString().split('T')[0]!,
          })
          .where(eq(workspaces.id, workspaceId))
        workspace.dailyCommitCount = 0
      }

      if (workspace.dailyCommitCount >= MAX_DAILY_COMMITS) {
        console.log(`Workspace ${workspaceId} hit daily commit limit`)
        continue
      }

      // Get pending commit info
      let pending = pendingCommits.get(workspaceId)
      if (!pending) {
        pending = {
          workspaceId,
          lastActivity: now,
          firstActivity: now,
        }
        pendingCommits.set(workspaceId, pending)
      }

      // Check if we should commit
      const idleMs = now - pending.lastActivity
      const totalMs = now - pending.firstActivity

      const idleMinutes = workspace.autoCommitIdleMinutes ?? DEFAULT_IDLE_MINUTES
      const maxMinutes = workspace.autoCommitMaxMinutes ?? DEFAULT_MAX_MINUTES

      const shouldCommit =
        idleMs >= idleMinutes * 60 * 1000 ||
        totalMs >= maxMinutes * 60 * 1000

      if (shouldCommit) {
        try {
          await performCommit(db, workspaceId)
          pendingCommits.delete(workspaceId)
        } catch (error) {
          console.error(`Failed to commit workspace ${workspaceId}:`, error)
        }
      }
    }
  }

  async function performCommit(
    db: Database,
    workspaceId: string,
    customMessage?: string
  ): Promise<void> {
    // Get workspace
    const [workspace] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1)

    if (!workspace) throw new Error('Workspace not found')

    // Get uncommitted changes
    const changes = await db
      .select()
      .from(documentChanges)
      .where(
        and(
          eq(documentChanges.workspaceId, workspaceId),
          eq(documentChanges.committed, false)
        )
      )

    if (changes.length === 0) {
      console.log(`No uncommitted changes for workspace ${workspaceId}`)
      return
    }

    // Get documents for the changes
    const docIds = [...new Set(changes.map((c) => c.documentId))]
    const docs = await db
      .select()
      .from(documents)
      .where(sql`${documents.id} = ANY(${docIds})`)

    // Build file contents for commit
    const files: Array<{ path: string; content: string }> = []

    for (const doc of docs) {
      const content = getDocContent(decodeDocState(new Uint8Array(doc.yjsState)))
      files.push({
        path: doc.path,
        content,
      })
    }

    // Generate commit message
    let message = customMessage
    if (!message) {
      message = await generateCommitMessage(changes, docs)
    }

    // Commit to GitHub
    const result = await commitToGitHub(db, workspaceId, files, message)
    const commitSha = result.sha

    // Mark changes as committed
    await db
      .update(documentChanges)
      .set({
        committed: true,
        commitSha,
      })
      .where(
        and(
          eq(documentChanges.workspaceId, workspaceId),
          eq(documentChanges.committed, false)
        )
      )

    // Update workspace
    await db
      .update(workspaces)
      .set({
        lastCommitAt: new Date(),
        lastCommitSha: commitSha,
        dailyCommitCount: sql`${workspaces.dailyCommitCount} + 1`,
      })
      .where(eq(workspaces.id, workspaceId))

    console.log(`Committed workspace ${workspaceId}: ${commitSha}`)

    // Notify Slack (fire-and-forget)
    notifyCommit(db, workspaceId, {
      sha: commitSha,
      message,
      filesChanged: files.map((f) => ({ path: f.path, additions: 0, deletions: 0 })),
    }).catch(console.error)
  }

  async function generateCommitMessage(
    changes: Array<{ changeType: string; sectionsAffected: string[] }>,
    docs: Array<{ path: string }>
  ): Promise<string> {
    // Summarize changes
    const creates = changes.filter((c) => c.changeType === 'create').length
    const updates = changes.filter((c) => c.changeType === 'update').length
    const deletes = changes.filter((c) => c.changeType === 'delete').length

    const paths = docs.map((d) => d.path)

    // Try to use Claude for a better message
    const anthropicKey = process.env.ANTHROPIC_API_KEY
    if (anthropicKey) {
      try {
        const anthropic = new Anthropic({ apiKey: anthropicKey })

        const prompt = `Generate a concise git commit message (max 72 chars subject line) for these documentation changes:

Files: ${paths.join(', ')}
Created: ${creates} files
Updated: ${updates} files
Deleted: ${deletes} files

Follow conventional commit format. Focus on what changed, not how.
Just output the commit message, nothing else.`

        const response = await anthropic.messages.create({
          model: 'claude-3-5-haiku-latest',
          max_tokens: 200,
          messages: [{ role: 'user', content: prompt }],
        })

        const text = response.content[0]
        if (text?.type === 'text') {
          return text.text.trim()
        }
      } catch (error) {
        console.error('Failed to generate AI commit message:', error)
      }
    }

    // Fallback to simple message
    const parts: string[] = []
    if (creates > 0) parts.push(`add ${creates} doc${creates > 1 ? 's' : ''}`)
    if (updates > 0) parts.push(`update ${updates} doc${updates > 1 ? 's' : ''}`)
    if (deletes > 0) parts.push(`remove ${deletes} doc${deletes > 1 ? 's' : ''}`)

    return `docs: ${parts.join(', ')}`
  }

  return {
    start() {
      if (interval) return
      interval = setInterval(checkAndCommit, CHECK_INTERVAL_MS)
      console.log('Commit service started')
    },

    stop() {
      if (interval) {
        clearInterval(interval)
        interval = null
      }
      console.log('Commit service stopped')
    },

    async commitNow(workspaceId: string, message?: string) {
      await performCommit(db, workspaceId, message)
    },
  }
}
