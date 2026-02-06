import dotenv from 'dotenv'
import { resolve } from 'path'

// Load .env from monorepo root
dotenv.config({ path: resolve(import.meta.dirname, '../../../.env') })
import { Server } from '@hocuspocus/server'
import { createAuthExtension } from './extensions/auth'
import { createPersistenceExtension } from './extensions/persistence'
import { createPresenceExtension } from './extensions/presence'
import { createConflictExtension } from './extensions/conflicts'
import { createCommitService } from './services/commit'
import { getDb } from '@collab/db'

const PORT = parseInt(process.env.PORT ?? '1234', 10)

async function main() {
  // Initialize database
  const db = getDb()

  // Initialize commit service (background task)
  const commitService = createCommitService(db)
  commitService.start()

  // Create Hocuspocus server
  const server = Server.configure({
    port: PORT,

    // Extensions
    extensions: [
      createAuthExtension(db),
      createPersistenceExtension(db),
      createPresenceExtension(),
      createConflictExtension(db),
    ],

    // Connection handling
    async onConnect(data) {
      console.log(`Client connected: ${data.documentName}`)
    },

    async onDisconnect(data) {
      console.log(`Client disconnected: ${data.documentName}`)
    },

    // Error handling
    async onDestroy() {
      console.log('Hocuspocus server destroyed')
    },
  })

  // Start server
  await server.listen()
  console.log(`Sync server running on port ${PORT}`)

  // Graceful shutdown
  const shutdown = async () => {
    console.log('Shutting down...')
    commitService.stop()
    await server.destroy()
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((err) => {
  console.error('Failed to start server:', err)
  process.exit(1)
})
