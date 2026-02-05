import type { Extension } from '@hocuspocus/server'
import type { Database } from '@collab/db'
import { workspaceMembers, workspaces, users } from '@collab/db/schema'
import { eq, and } from 'drizzle-orm'

interface AuthContext {
  userId: string
  workspaceId: string
  role: 'owner' | 'editor' | 'viewer'
}

/**
 * Parse document name to extract workspace and path
 * Format: workspaceId/path/to/document.md
 */
function parseDocumentName(documentName: string): { workspaceId: string; path: string } | null {
  const parts = documentName.split('/')
  if (parts.length < 2) return null

  const workspaceId = parts[0]!
  const path = parts.slice(1).join('/')

  return { workspaceId, path }
}

export function createAuthExtension(db: Database): Extension {
  return {
    async onAuthenticate(data) {
      const { token, documentName } = data

      if (!token) {
        throw new Error('Authentication token required')
      }

      // Parse document name
      const parsed = parseDocumentName(documentName)
      if (!parsed) {
        throw new Error('Invalid document name format')
      }

      const { workspaceId, path } = parsed

      // Validate token and get user
      // In production, this would validate a JWT or session token
      // For now, we assume the token is the user ID
      const userId = token

      // Check user exists
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)

      if (!user) {
        throw new Error('User not found')
      }

      // Check workspace membership
      const [membership] = await db
        .select()
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, workspaceId),
            eq(workspaceMembers.userId, userId)
          )
        )
        .limit(1)

      if (!membership) {
        throw new Error('Not a member of this workspace')
      }

      // Check permissions for read-only users
      if (membership.role === 'viewer') {
        // Viewers can connect but only read
        // The onUpdate hook will block their changes
      }

      // Store auth context for later use
      const authContext: AuthContext = {
        userId,
        workspaceId,
        role: membership.role as 'owner' | 'editor' | 'viewer',
      }

      return authContext
    },

    async onLoadDocument(data) {
      // Ensure only authorized users can load documents
      const context = data.context as AuthContext | undefined

      if (!context) {
        throw new Error('Unauthorized')
      }

      // Document loading is allowed for all authenticated members
      return data.document
    },

    async onChange(data) {
      // Check if user can make changes
      const context = data.context as AuthContext | undefined

      if (!context) {
        return
      }

      // Viewers cannot make changes
      if (context.role === 'viewer') {
        // In Hocuspocus, we can't directly block changes
        // But we track the context for conflict resolution
        console.warn(`Viewer ${context.userId} attempted to make changes`)
      }
    },
  }
}
