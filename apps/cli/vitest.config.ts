import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
  },
  resolve: {
    alias: [
      { find: '@collab/shared', replacement: path.resolve(__dirname, '../../packages/shared/src/index.ts') },
      { find: '@collab/sync', replacement: path.resolve(__dirname, '../../packages/sync/src/index.ts') },
    ],
  },
})
