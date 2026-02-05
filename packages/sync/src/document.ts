import * as Y from 'yjs'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'

/**
 * Create a new Yjs document with the standard collab structure
 */
export function createCollabDoc(initialContent = ''): Y.Doc {
  const doc = new Y.Doc()
  const content = doc.getText('content')

  if (initialContent) {
    content.insert(0, initialContent)
  }

  return doc
}

/**
 * Get the text content from a collab document
 */
export function getDocContent(doc: Y.Doc): string {
  return doc.getText('content').toString()
}

/**
 * Set the text content of a collab document (replaces all content)
 */
export function setDocContent(doc: Y.Doc, content: string): void {
  const text = doc.getText('content')
  doc.transact(() => {
    text.delete(0, text.length)
    text.insert(0, content)
  })
}

/**
 * Apply a text update to a document at a specific position
 */
export function applyTextUpdate(
  doc: Y.Doc,
  position: number,
  deleteCount: number,
  insertText: string
): void {
  const text = doc.getText('content')
  doc.transact(() => {
    if (deleteCount > 0) {
      text.delete(position, deleteCount)
    }
    if (insertText) {
      text.insert(position, insertText)
    }
  })
}

/**
 * Encode a Yjs document state to a Uint8Array
 */
export function encodeDocState(doc: Y.Doc): Uint8Array {
  return Y.encodeStateAsUpdate(doc)
}

/**
 * Decode a Uint8Array state into a Yjs document
 */
export function decodeDocState(state: Uint8Array): Y.Doc {
  const doc = new Y.Doc()
  Y.applyUpdate(doc, state)
  return doc
}

/**
 * Apply an update to an existing document
 */
export function applyDocUpdate(doc: Y.Doc, update: Uint8Array): void {
  Y.applyUpdate(doc, update)
}

/**
 * Get the state vector of a document (for sync)
 */
export function getStateVector(doc: Y.Doc): Uint8Array {
  return Y.encodeStateVector(doc)
}

/**
 * Compute the diff between a document and a state vector
 */
export function computeStateDiff(doc: Y.Doc, stateVector: Uint8Array): Uint8Array {
  return Y.encodeStateAsUpdate(doc, stateVector)
}

/**
 * Merge two documents, returning the merged result
 */
export function mergeDocs(doc1: Y.Doc, doc2: Y.Doc): Y.Doc {
  const merged = new Y.Doc()

  // Apply both states to the merged doc
  const state1 = encodeDocState(doc1)
  const state2 = encodeDocState(doc2)

  Y.applyUpdate(merged, state1)
  Y.applyUpdate(merged, state2)

  return merged
}

/**
 * Create a snapshot of a document at its current state
 */
export function createSnapshot(doc: Y.Doc): Y.Snapshot {
  return Y.snapshot(doc)
}

/**
 * Get the content of a document at a specific snapshot
 */
export function getSnapshotContent(doc: Y.Doc, snapshot: Y.Snapshot): string {
  const text = doc.getText('content')
  // Create a temporary doc to restore the snapshot state
  const tempDoc = new Y.Doc()
  Y.applyUpdate(tempDoc, Y.encodeStateAsUpdate(doc))
  // Restore to snapshot
  const restoredText = Y.createDocFromSnapshot(tempDoc, snapshot).getText('content')
  return restoredText.toString()
}

/**
 * Subscribe to document updates
 */
export function onDocUpdate(
  doc: Y.Doc,
  callback: (update: Uint8Array, origin: unknown) => void
): () => void {
  doc.on('update', callback)
  return () => doc.off('update', callback)
}

/**
 * Subscribe to document changes (higher level than updates)
 */
export function onDocChange(
  doc: Y.Doc,
  callback: (event: Y.YTextEvent, transaction: Y.Transaction) => void
): () => void {
  const text = doc.getText('content')
  text.observe(callback)
  return () => text.unobserve(callback)
}

/**
 * Convert a Yjs update to a Buffer (for database storage)
 */
export function updateToBuffer(update: Uint8Array): Buffer {
  return Buffer.from(update)
}

/**
 * Convert a Buffer back to a Yjs update
 */
export function bufferToUpdate(buffer: Buffer): Uint8Array {
  return new Uint8Array(buffer)
}

/**
 * Compute a content hash for change detection
 */
export function computeContentHash(content: string): string {
  // Simple hash using Web Crypto API compatible approach
  let hash = 0
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i)
    hash = ((hash << 5) - hash + char) | 0
  }
  return hash.toString(16)
}

/**
 * Check if two documents have the same content
 */
export function docsAreEqual(doc1: Y.Doc, doc2: Y.Doc): boolean {
  return getDocContent(doc1) === getDocContent(doc2)
}
