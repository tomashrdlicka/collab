import * as fs from 'fs'
import * as path from 'path'
import chokidar from 'chokidar'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { createCollabDoc, getDocContent, setDocContent } from '@collab/sync'
import { FILE_WATCH_IGNORED, FILE_WATCH_DEBOUNCE_MS } from '@collab/shared'

interface SyncClientOptions {
  workspaceId: string
  localPath: string
  wsUrl: string
  token: string
  userId: string
  userName: string
  onConnected?: () => void
  onDisconnected?: () => void
  onFileChange?: (path: string, type: 'add' | 'change' | 'remove') => void
  onError?: (error: Error) => void
}

interface SyncClient {
  start(): Promise<void>
  stop(): Promise<void>
}

interface DocState {
  doc: Y.Doc
  provider: WebsocketProvider
  localContent: string
}

export async function createSyncClient(options: SyncClientOptions): Promise<SyncClient> {
  const {
    workspaceId,
    localPath,
    wsUrl,
    token,
    userId,
    userName,
    onConnected,
    onDisconnected,
    onFileChange,
    onError,
  } = options

  // Track synced documents
  const documents = new Map<string, DocState>()

  // File watcher
  let watcher: chokidar.FSWatcher | null = null

  // Debounce map for local changes
  const pendingWrites = new Map<string, NodeJS.Timeout>()

  // Flag to prevent feedback loops
  let isApplyingRemote = false

  /**
   * Get or create a Yjs document for a file
   */
  async function getOrCreateDoc(filePath: string): Promise<DocState> {
    const relativePath = path.relative(localPath, filePath)
    const existing = documents.get(relativePath)
    if (existing) return existing

    // Create new Yjs document
    const doc = new Y.Doc()
    const text = doc.getText('content')

    // Read local file content
    let localContent = ''
    if (fs.existsSync(filePath)) {
      localContent = fs.readFileSync(filePath, 'utf-8')
      text.insert(0, localContent)
    }

    // Connect to sync server
    const documentName = `${workspaceId}/${relativePath}`
    const provider = new WebsocketProvider(wsUrl, documentName, doc, {
      params: { token },
    })

    // Set up awareness
    provider.awareness.setLocalStateField('user', {
      name: userName,
      color: '#' + Math.floor(Math.random() * 16777215).toString(16),
    })

    // Handle connection events
    provider.on('status', (event: { status: string }) => {
      if (event.status === 'connected') {
        onConnected?.()
      } else if (event.status === 'disconnected') {
        onDisconnected?.()
      }
    })

    // Handle remote changes
    text.observe((event) => {
      if (event.transaction.local) return
      if (isApplyingRemote) return

      // Write remote changes to local file
      const content = text.toString()
      writeLocalFile(filePath, content)
    })

    const state: DocState = { doc, provider, localContent }
    documents.set(relativePath, state)

    return state
  }

  /**
   * Write content to local file (debounced)
   */
  function writeLocalFile(filePath: string, content: string): void {
    // Clear existing timeout
    const existing = pendingWrites.get(filePath)
    if (existing) {
      clearTimeout(existing)
    }

    // Debounce write
    const timeout = setTimeout(() => {
      try {
        isApplyingRemote = true

        // Ensure directory exists
        const dir = path.dirname(filePath)
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true })
        }

        fs.writeFileSync(filePath, content, 'utf-8')
        onFileChange?.(path.relative(localPath, filePath), 'change')
      } catch (error) {
        onError?.(error instanceof Error ? error : new Error('Failed to write file'))
      } finally {
        isApplyingRemote = false
        pendingWrites.delete(filePath)
      }
    }, FILE_WATCH_DEBOUNCE_MS)

    pendingWrites.set(filePath, timeout)
  }

  /**
   * Handle local file change
   */
  async function handleLocalChange(filePath: string): Promise<void> {
    if (isApplyingRemote) return

    try {
      const state = await getOrCreateDoc(filePath)
      const content = fs.readFileSync(filePath, 'utf-8')

      // Skip if content hasn't changed
      if (content === state.localContent) return

      // Update Yjs document
      const text = state.doc.getText('content')
      state.doc.transact(() => {
        text.delete(0, text.length)
        text.insert(0, content)
      })

      state.localContent = content
      onFileChange?.(path.relative(localPath, filePath), 'change')
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error('Failed to handle file change'))
    }
  }

  /**
   * Handle local file addition
   */
  async function handleLocalAdd(filePath: string): Promise<void> {
    try {
      await getOrCreateDoc(filePath)
      onFileChange?.(path.relative(localPath, filePath), 'add')
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error('Failed to handle file addition'))
    }
  }

  /**
   * Handle local file removal
   */
  async function handleLocalRemove(filePath: string): Promise<void> {
    const relativePath = path.relative(localPath, filePath)
    const state = documents.get(relativePath)

    if (state) {
      state.provider.disconnect()
      state.doc.destroy()
      documents.delete(relativePath)
    }

    onFileChange?.(relativePath, 'remove')
  }

  return {
    async start() {
      // Initialize watcher
      watcher = chokidar.watch(path.join(localPath, '**/*.md'), {
        ignored: FILE_WATCH_IGNORED,
        persistent: true,
        ignoreInitial: false,
        awaitWriteFinish: {
          stabilityThreshold: FILE_WATCH_DEBOUNCE_MS,
          pollInterval: 100,
        },
      })

      watcher
        .on('add', handleLocalAdd)
        .on('change', handleLocalChange)
        .on('unlink', handleLocalRemove)
        .on('error', (error) => {
          onError?.(error)
        })

      // Wait for initial scan
      await new Promise<void>((resolve) => {
        watcher!.on('ready', resolve)
      })
    },

    async stop() {
      // Clear pending writes
      for (const timeout of pendingWrites.values()) {
        clearTimeout(timeout)
      }
      pendingWrites.clear()

      // Close file watcher
      if (watcher) {
        await watcher.close()
        watcher = null
      }

      // Disconnect all documents
      for (const state of documents.values()) {
        state.provider.disconnect()
        state.doc.destroy()
      }
      documents.clear()
    },
  }
}
