import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

export * from './schema'
export { schema }

// Create database connection
export function createDb(connectionString: string) {
  const client = postgres(connectionString)
  return drizzle(client, { schema })
}

// Type for the database instance
export type Database = ReturnType<typeof createDb>

// Helper to get database URL from environment
export function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error('DATABASE_URL environment variable is not set')
  }
  return url
}

// Singleton instance for server-side use
let db: Database | null = null

export function getDb(): Database {
  if (!db) {
    db = createDb(getDatabaseUrl())
  }
  return db
}
