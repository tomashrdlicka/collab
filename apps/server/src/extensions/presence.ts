import type { Extension } from '@hocuspocus/server'
import { getUserColor } from '@collab/sync'
import type { UserPresence } from '@collab/shared'

interface AuthContext {
  userId: string
  workspaceId: string
  role: string
  userName?: string
  userType?: 'human' | 'agent'
  agentName?: string
}

/**
 * Extension for handling user presence and awareness
 */
export function createPresenceExtension(): Extension {
  // Track connected users per document
  const documentUsers = new Map<string, Map<string, UserPresence>>()

  return {
    async onConnect(data) {
      const context = data.context as AuthContext | undefined
      if (!context) return

      // Initialize document users map
      if (!documentUsers.has(data.documentName)) {
        documentUsers.set(data.documentName, new Map())
      }

      // Add user to document
      const users = documentUsers.get(data.documentName)!
      const presence: UserPresence = {
        id: context.userId,
        name: context.userName ?? 'Anonymous',
        color: getUserColor(context.userId),
        type: context.userType ?? 'human',
        agentName: context.agentName,
        cursor: null,
      }
      users.set(context.userId, presence)

      console.log(`User ${context.userId} connected to ${data.documentName}`)
    },

    async onDisconnect(data) {
      const context = data.context as AuthContext | undefined
      if (!context) return

      // Remove user from document
      const users = documentUsers.get(data.documentName)
      if (users) {
        users.delete(context.userId)
        if (users.size === 0) {
          documentUsers.delete(data.documentName)
        }
      }

      console.log(`User ${context.userId} disconnected from ${data.documentName}`)
    },

    async onAwarenessUpdate(data) {
      const context = data.context as AuthContext | undefined
      if (!context) return

      // Update user presence with awareness data
      const users = documentUsers.get(data.documentName)
      if (!users) return

      const presence = users.get(context.userId)
      if (!presence) return

      // Parse awareness states from the update
      // Hocuspocus awareness updates contain cursor positions
      const states = data.states as Map<number, Record<string, unknown>>

      for (const [clientId, state] of states) {
        const cursor = state.cursor as { anchor: number; head: number } | undefined
        const user = state.user as { name?: string; color?: string } | undefined

        if (user?.name) {
          presence.name = user.name
        }
        if (cursor) {
          presence.cursor = cursor
        }
      }

      users.set(context.userId, presence)
    },

    // Custom method to get presence for a document
    // This can be called from other parts of the server
    getDocumentPresence(documentName: string): UserPresence[] {
      const users = documentUsers.get(documentName)
      if (!users) return []
      return Array.from(users.values())
    },
  }
}
