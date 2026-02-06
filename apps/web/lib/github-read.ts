import type { Database } from '@collab/db'
import { githubTokens } from '@collab/db/schema'
import { eq } from 'drizzle-orm'
import { decryptToken } from '@collab/shared'

const GITHUB_API = 'https://api.github.com'

const MAX_FILE_SIZE_BYTES = 1_000_000 // 1MB - GitHub Contents API limit
const FETCH_BATCH_SIZE = 5

export interface ImportableFile {
  path: string
  size: number
  sha: string
}

export interface FileWithContent {
  path: string
  content: string
}

async function getGitHubToken(db: Database, userId: string): Promise<string | null> {
  const [tokenRecord] = await db
    .select()
    .from(githubTokens)
    .where(eq(githubTokens.userId, userId))
    .limit(1)

  if (!tokenRecord) return null
  return decryptToken(tokenRecord.encryptedToken)
}

async function githubFetch(
  token: string,
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  return fetch(`${GITHUB_API}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...options.headers,
    },
  })
}

/**
 * Scan a repository for markdown files using the Git Trees API (single API call).
 * Filters to .md files under basePath, skips files > 1MB.
 */
export async function scanRepositoryMarkdownFiles(
  db: Database,
  userId: string,
  owner: string,
  repo: string,
  branch: string,
  basePath: string
): Promise<{ files: ImportableFile[]; truncated: boolean }> {
  const token = await getGitHubToken(db, userId)
  if (!token) throw new Error('No GitHub token found')

  const response = await githubFetch(
    token,
    `/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`
  )

  if (!response.ok) {
    throw new Error(`Failed to scan repository: ${await response.text()}`)
  }

  const data = (await response.json()) as {
    tree: Array<{ path: string; type: string; size?: number; sha: string }>
    truncated: boolean
  }

  // Normalize basePath: remove leading/trailing slashes, handle root "/"
  const normalizedBase = basePath === '/' ? '' : basePath.replace(/^\/|\/$/g, '')

  const files: ImportableFile[] = []
  for (const item of data.tree) {
    if (item.type !== 'blob') continue
    if (!item.path.endsWith('.md')) continue

    // Filter by basePath
    if (normalizedBase && !item.path.startsWith(`${normalizedBase}/`)) continue

    // Skip files over 1MB
    const size = item.size ?? 0
    if (size > MAX_FILE_SIZE_BYTES) continue

    files.push({
      path: item.path,
      size,
      sha: item.sha,
    })
  }

  return { files, truncated: data.truncated }
}

/**
 * Fetch file contents from GitHub in batches.
 * Uses the Contents API to get base64-encoded content.
 */
export async function fetchFileContents(
  db: Database,
  userId: string,
  owner: string,
  repo: string,
  branch: string,
  files: ImportableFile[]
): Promise<{ results: FileWithContent[]; errors: Array<{ path: string; error: string }> }> {
  const token = await getGitHubToken(db, userId)
  if (!token) throw new Error('No GitHub token found')

  const results: FileWithContent[] = []
  const errors: Array<{ path: string; error: string }> = []

  // Process in batches to avoid rate limits
  for (let i = 0; i < files.length; i += FETCH_BATCH_SIZE) {
    const batch = files.slice(i, i + FETCH_BATCH_SIZE)

    const batchResults = await Promise.allSettled(
      batch.map(async (file) => {
        const response = await githubFetch(
          token,
          `/repos/${owner}/${repo}/contents/${file.path}?ref=${branch}`
        )

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${await response.text()}`)
        }

        const data = (await response.json()) as { encoding: string; content: string }

        if (data.encoding === 'base64') {
          return {
            path: file.path,
            content: Buffer.from(data.content, 'base64').toString('utf8'),
          }
        }

        return { path: file.path, content: data.content }
      })
    )

    for (let j = 0; j < batchResults.length; j++) {
      const result = batchResults[j]!
      const file = batch[j]!
      if (result.status === 'fulfilled') {
        results.push(result.value)
      } else {
        errors.push({
          path: file.path,
          error: result.reason instanceof Error ? result.reason.message : 'Unknown error',
        })
      }
    }
  }

  return { results, errors }
}
