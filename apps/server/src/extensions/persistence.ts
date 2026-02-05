import type { Extension } from '@hocuspocus/server'
import type { Database } from '@collab/db'
import { documents, documentChanges } from '@collab/db/schema'
import { eq, and } from 'drizzle-orm'
import { encodeDocState, decodeDocState, getDocContent, computeContentHash, getDiffPreview } from '@collab/sync'
import { notifyDocumentChanges } from '../services/slack'
import * as Y from 'yjs'

interface AuthContext {
  userId: string
  workspaceId: string
  role: string
}

/**
 * Parse document name to extract workspace and path
 */
function parseDocumentName(documentName: string): { workspaceId: string; path: string } | null {
  const parts = documentName.split('/')
  if (parts.length < 2) return null

  const workspaceId = parts[0]!
  const path = parts.slice(1).join('/')

  return { workspaceId, path }
}

export function createPersistenceExtension(db: Database): Extension {
  // Debounce map for batching saves
  const saveTimeouts = new Map<string, NodeJS.Timeout>()
  const SAVE_DEBOUNCE_MS = 1000

  return {
    async onLoadDocument(data) {
      const parsed = parseDocumentName(data.documentName)
      if (!parsed) {
        return data.document
      }

      const { workspaceId, path } = parsed

      // Try to load existing document from database
      const [existingDoc] = await db
        .select()
        .from(documents)
        .where(
          and(
            eq(documents.workspaceId, workspaceId),
            eq(documents.path, path)
          )
        )
        .limit(1)

      if (existingDoc && existingDoc.yjsState) {
        // Load existing state into the document
        const state = new Uint8Array(existingDoc.yjsState)
        Y.applyUpdate(data.document, state)
      }

      return data.document
    },

    async onStoreDocument(data) {
      const parsed = parseDocumentName(data.documentName)
      if (!parsed) {
        return
      }

      const { workspaceId, path } = parsed
      const context = data.context as AuthContext | undefined

      // Clear any pending save timeout
      const existingTimeout = saveTimeouts.get(data.documentName)
      if (existingTimeout) {
        clearTimeout(existingTimeout)
      }

      // Debounce the save
      const timeout = setTimeout(async () => {
        try {
          const state = encodeDocState(data.document)
          const content = getDocContent(data.document)
          const contentHash = computeContentHash(content)

          // Check if document exists
          const [existingDoc] = await db
            .select()
            .from(documents)
            .where(
              and(
                eq(documents.workspaceId, workspaceId),
                eq(documents.path, path)
              )
            )
            .limit(1)

          if (existingDoc) {
            // Check if content actually changed
            if (existingDoc.contentHash === contentHash) {
              return // No actual change
            }

            // Compute diff preview before updating
            const oldContent = getDocContent(decodeDocState(new Uint8Array(existingDoc.yjsState)))
            const diffPreview = getDiffPreview(oldContent, content)

            // Update existing document
            await db
              .update(documents)
              .set({
                yjsState: Buffer.from(state),
                contentHash,
                lastModifiedBy: context?.userId ?? null,
                lastModifiedAt: new Date(),
              })
              .where(eq(documents.id, existingDoc.id))

            // Record the change
            const userType = context?.userId ? 'human' : 'system'
            await db.insert(documentChanges).values({
              documentId: existingDoc.id,
              workspaceId,
              userId: context?.userId ?? null,
              userType,
              changeType: 'update',
              sectionsAffected: [],
              diffPreview,
              committed: false,
            })

            // Notify Slack (fire-and-forget)
            notifyDocumentChanges(db, workspaceId, [{
              path,
              userName: context?.userId ?? 'System',
              userType: userType as 'human' | 'agent',
              changeType: 'update',
            }]).catch(console.error)
          } else {
            // Create new document
            const [newDoc] = await db
              .insert(documents)
              .values({
                workspaceId,
                path,
                yjsState: Buffer.from(state),
                contentHash,
                lastModifiedBy: context?.userId ?? null,
              })
              .returning()

            if (newDoc) {
              // Record the creation
              const userType = context?.userId ? 'human' : 'system'
              await db.insert(documentChanges).values({
                documentId: newDoc.id,
                workspaceId,
                userId: context?.userId ?? null,
                userType,
                changeType: 'create',
                sectionsAffected: [],
                committed: false,
              })

              // Notify Slack (fire-and-forget)
              notifyDocumentChanges(db, workspaceId, [{
                path,
                userName: context?.userId ?? 'System',
                userType: userType as 'human' | 'agent',
                changeType: 'create',
              }]).catch(console.error)
            }
          }
        } catch (error) {
          console.error('Failed to persist document:', error)
        } finally {
          saveTimeouts.delete(data.documentName)
        }
      }, SAVE_DEBOUNCE_MS)

      saveTimeouts.set(data.documentName, timeout)
    },

    async onDestroy() {
      // Clear all pending saves
      for (const timeout of saveTimeouts.values()) {
        clearTimeout(timeout)
      }
      saveTimeouts.clear()
    },
  }
}
