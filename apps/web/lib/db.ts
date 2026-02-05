import { getDb, type Database } from '@collab/db'

let db: Database | null = null

export function getDatabase(): Database {
  if (!db) {
    db = getDb()
  }
  return db
}
