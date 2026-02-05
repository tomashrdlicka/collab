import type { Database } from '@collab/db'
import { workspaceIntegrations, workspaces, users } from '@collab/db/schema'
import { eq, and } from 'drizzle-orm'
import type { SlackConfig, DocumentChange, User, Workspace } from '@collab/shared'

interface SlackMessage {
  text: string
  blocks?: SlackBlock[]
}

interface SlackBlock {
  type: string
  text?: {
    type: string
    text: string
    emoji?: boolean
  }
  fields?: Array<{
    type: string
    text: string
  }>
  elements?: SlackBlock[]
  accessory?: {
    type: string
    text: {
      type: string
      text: string
    }
    url?: string
    action_id?: string
  }
}

/**
 * Send a Slack notification via webhook
 */
async function sendSlackWebhook(webhookUrl: string, message: SlackMessage): Promise<void> {
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    })

    if (!response.ok) {
      console.error('Slack webhook failed:', await response.text())
    }
  } catch (error) {
    console.error('Failed to send Slack webhook:', error)
  }
}

/**
 * Get Slack integration config for a workspace
 */
async function getSlackConfig(
  db: Database,
  workspaceId: string
): Promise<SlackConfig | null> {
  const [integration] = await db
    .select()
    .from(workspaceIntegrations)
    .where(
      and(
        eq(workspaceIntegrations.workspaceId, workspaceId),
        eq(workspaceIntegrations.type, 'slack'),
        eq(workspaceIntegrations.enabled, true)
      )
    )
    .limit(1)

  if (!integration) return null

  return JSON.parse(integration.config) as SlackConfig
}

/**
 * Notify about document changes
 */
export async function notifyDocumentChanges(
  db: Database,
  workspaceId: string,
  changes: Array<{
    path: string
    userName: string
    userType: 'human' | 'agent'
    changeType: 'create' | 'update' | 'delete'
    summary?: string
  }>
): Promise<void> {
  const config = await getSlackConfig(db, workspaceId)
  if (!config) return

  // Filter based on config
  const relevantChanges = changes.filter((c) => {
    if (c.userType === 'agent' && !config.notifyAgentChanges) return false
    if (c.userType === 'human' && !config.notifyHumanChanges) return false
    return true
  })

  if (relevantChanges.length === 0) return

  // Get workspace info
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1)

  if (!workspace) return

  // Build message
  const message: SlackMessage = {
    text: `Changes in ${workspace.name}`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `Changes in ${workspace.name}`,
          emoji: true,
        },
      },
      {
        type: 'divider',
      } as SlackBlock,
    ],
  }

  for (const change of relevantChanges) {
    const emoji = change.userType === 'agent' ? ':robot_face:' : ':bust_in_silhouette:'
    const action =
      change.changeType === 'create'
        ? 'created'
        : change.changeType === 'delete'
        ? 'deleted'
        : 'updated'

    message.blocks!.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${emoji} *${change.userName}* ${action} \`${change.path}\`${
          change.summary ? `\n>${change.summary}` : ''
        }`,
      },
    })
  }

  // Add view button
  message.blocks!.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: {
          type: 'plain_text',
          text: 'View changes',
        },
        url: `${process.env.NEXTAUTH_URL}/w/${workspace.slug}`,
        action_id: 'view_changes',
      } as unknown as SlackBlock,
    ],
  })

  await sendSlackWebhook(config.webhookUrl, message)
}

/**
 * Notify about a commit
 */
export async function notifyCommit(
  db: Database,
  workspaceId: string,
  commit: {
    sha: string
    message: string
    filesChanged: Array<{ path: string; additions: number; deletions: number }>
  }
): Promise<void> {
  const config = await getSlackConfig(db, workspaceId)
  if (!config || !config.notifyCommits) return

  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1)

  if (!workspace) return

  const filesSummary = commit.filesChanged
    .map((f) => `  \`${f.path}\` (+${f.additions}, -${f.deletions})`)
    .join('\n')

  const message: SlackMessage = {
    text: `Committed to ${workspace.name}`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: ':package: Committed to GitHub',
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${commit.message}*\n\n${commit.filesChanged.length} file${
            commit.filesChanged.length > 1 ? 's' : ''
          } changed:\n${filesSummary}`,
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'View commit',
            },
            url: `https://github.com/${workspace.githubRepo}/commit/${commit.sha}`,
            action_id: 'view_commit',
          } as unknown as SlackBlock,
        ],
      },
    ],
  }

  await sendSlackWebhook(config.webhookUrl, message)
}

/**
 * Notify about a new collaborator
 */
export async function notifyCollaboratorJoined(
  db: Database,
  workspaceId: string,
  user: { name: string; avatarUrl?: string }
): Promise<void> {
  const config = await getSlackConfig(db, workspaceId)
  if (!config || !config.notifyCollaborators) return

  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1)

  if (!workspace) return

  const message: SlackMessage = {
    text: `${user.name} joined ${workspace.name}`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:wave: *${user.name}* joined *${workspace.name}*`,
        },
      },
    ],
  }

  await sendSlackWebhook(config.webhookUrl, message)
}

/**
 * Notify about a conflict
 */
export async function notifyConflict(
  db: Database,
  workspaceId: string,
  conflict: {
    documentPath: string
    lineNumber: number
    users: string[]
  }
): Promise<void> {
  const config = await getSlackConfig(db, workspaceId)
  if (!config || !config.notifyConflicts) return

  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1)

  if (!workspace) return

  const message: SlackMessage = {
    text: `Conflict detected in ${workspace.name}`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:warning: *Conflict detected*\n\nFile: \`${conflict.documentPath}\`\nLine: ${conflict.lineNumber}\nUsers: ${conflict.users.join(', ')}`,
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'Resolve in editor',
            },
            url: `${process.env.NEXTAUTH_URL}/w/${workspace.slug}/${conflict.documentPath}`,
            action_id: 'resolve_conflict',
          } as unknown as SlackBlock,
        ],
      },
    ],
  }

  await sendSlackWebhook(config.webhookUrl, message)
}
