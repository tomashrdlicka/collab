import type { Extension } from '@hocuspocus/server'
import type { Database } from '@collab/db'
import { conflicts, documents } from '@collab/db/schema'
import { eq, and, isNull } from 'drizzle-orm'
import { CONFLICT_WINDOW_MS } from '@collab/shared'
import type { ConflictVersion } from '@collab/shared'

interface AuthContext {
  userId: string
  workspaceId: string
  role: string
  userName?: string
  userType?: 'human' | 'agent'
}

interface LineEdit {
  userId: string
  userName: string
  userType: 'human' | 'agent' | 'system'
  lineNumber: number
  content: string
  timestamp: number
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

/**
 * Get line number from character offset
 */
function getLineNumber(content: string, offset: number): number {
  const beforeOffset = content.slice(0, offset)
  return beforeOffset.split('\n').length
}

/**
 * Get line content at a given line number
 */
function getLineContent(content: string, lineNumber: number): string {
  const lines = content.split('\n')
  return lines[lineNumber - 1] ?? ''
}

export function createConflictExtension(db: Database): Extension {
  // Track recent edits per document for conflict detection
  const recentEdits = new Map<string, LineEdit[]>()

  // Clean up old edits periodically
  const cleanupInterval = setInterval(() => {
    const now = Date.now()
    for (const [docName, edits] of recentEdits) {
      const filtered = edits.filter((e) => now - e.timestamp < CONFLICT_WINDOW_MS * 2)
      if (filtered.length === 0) {
        recentEdits.delete(docName)
      } else {
        recentEdits.set(docName, filtered)
      }
    }
  }, CONFLICT_WINDOW_MS)

  return {
    async onChange(data) {
      const context = data.context as AuthContext | undefined
      if (!context) return

      const parsed = parseDocumentName(data.documentName)
      if (!parsed) return

      // Get the text content
      const text = data.document.getText('content')
      const content = text.toString()

      // Track this edit
      // Note: In a real implementation, we'd need to determine which lines changed
      // from the Yjs update. For simplicity, we'll just track the current state.
      // A more sophisticated approach would analyze the Y.js delta.

      // For now, we'll skip automatic conflict detection in the extension
      // and rely on the persistence layer to detect conflicts when saving
    },

    async onDestroy() {
      clearInterval(cleanupInterval)
      recentEdits.clear()
    },
  }
}

/**
 * Check for conflicts between edits
 */
export async function checkForConflicts(
  db: Database,
  documentName: string,
  edits: LineEdit[]
): Promise<void> {
  // Group edits by line number
  const editsByLine = new Map<number, LineEdit[]>()

  for (const edit of edits) {
    if (!editsByLine.has(edit.lineNumber)) {
      editsByLine.set(edit.lineNumber, [])
    }
    editsByLine.get(edit.lineNumber)!.push(edit)
  }

  // Check for conflicts (multiple users editing same line within window)
  const parsed = parseDocumentName(documentName)
  if (!parsed) return

  const { workspaceId, path } = parsed

  // Get document ID
  const [doc] = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.workspaceId, workspaceId),
        eq(documents.path, path)
      )
    )
    .limit(1)

  if (!doc) return

  for (const [lineNumber, lineEdits] of editsByLine) {
    // Get unique users who edited this line
    const userIds = new Set(lineEdits.map((e) => e.userId))

    if (userIds.size > 1) {
      // Check time window
      const timestamps = lineEdits.map((e) => e.timestamp)
      const minTime = Math.min(...timestamps)
      const maxTime = Math.max(...timestamps)

      if (maxTime - minTime < CONFLICT_WINDOW_MS) {
        // Conflict detected!
        const versions: ConflictVersion[] = lineEdits.map((edit) => ({
          userId: edit.userId,
          userName: edit.userName,
          userType: edit.userType,
          content: edit.content,
          timestamp: edit.timestamp,
        }))

        // Check if there's already an unresolved conflict for this line
        const [existingConflict] = await db
          .select()
          .from(conflicts)
          .where(
            and(
              eq(conflicts.documentId, doc.id),
              eq(conflicts.lineNumber, lineNumber),
              isNull(conflicts.resolvedAt)
            )
          )
          .limit(1)

        if (!existingConflict) {
          // Create new conflict
          await db.insert(conflicts).values({
            documentId: doc.id,
            lineNumber,
            versions: JSON.stringify(versions),
          })

          console.log(`Conflict detected in ${documentName} at line ${lineNumber}`)
        }
      }
    }
  }
}

/**
 * Resolve a conflict
 */
export async function resolveConflict(
  db: Database,
  conflictId: string,
  resolution: string,
  resolvedBy: string
): Promise<void> {
  await db
    .update(conflicts)
    .set({
      resolvedAt: new Date(),
      resolvedBy,
      resolution,
    })
    .where(eq(conflicts.id, conflictId))
}

/**
 * Get unresolved conflicts for a document
 */
export async function getUnresolvedConflicts(
  db: Database,
  documentId: string
): Promise<Array<{
  id: string
  lineNumber: number
  versions: ConflictVersion[]
  createdAt: Date
}>> {
  const results = await db
    .select()
    .from(conflicts)
    .where(
      and(
        eq(conflicts.documentId, documentId),
        isNull(conflicts.resolvedAt)
      )
    )

  return results.map((c) => ({
    id: c.id,
    lineNumber: c.lineNumber,
    versions: JSON.parse(c.versions) as ConflictVersion[],
    createdAt: c.createdAt,
  }))
}
