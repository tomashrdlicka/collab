import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(__dirname) },
      { find: '@collab/db/schema', replacement: path.resolve(__dirname, '../../packages/db/src/schema.ts') },
      { find: '@collab/db', replacement: path.resolve(__dirname, '../../packages/db/src/index.ts') },
      { find: '@collab/shared', replacement: path.resolve(__dirname, '../../packages/shared/src/index.ts') },
      { find: '@collab/sync', replacement: path.resolve(__dirname, '../../packages/sync/src/index.ts') },
    ],
  },
})
