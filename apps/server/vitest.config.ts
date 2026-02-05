import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
  },
  resolve: {
    alias: [
      // More specific paths first
      { find: '@collab/db/schema', replacement: path.resolve(__dirname, '../../packages/db/src/schema.ts') },
      { find: '@collab/db', replacement: path.resolve(__dirname, '../../packages/db/src/index.ts') },
      { find: '@collab/shared', replacement: path.resolve(__dirname, '../../packages/shared/src/index.ts') },
      { find: '@collab/sync', replacement: path.resolve(__dirname, '../../packages/sync/src/index.ts') },
    ],
  },
})
