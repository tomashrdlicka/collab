import type { Database } from '@collab/db'
import { githubTokens, workspaces } from '@collab/db/schema'
import { eq } from 'drizzle-orm'
import { decryptToken } from '@collab/shared'

const GITHUB_API = 'https://api.github.com'

export interface GitHubFile {
  path: string
  content: string
}

export interface CommitResult {
  sha: string
  url: string
}

/**
 * Get the GitHub token for a user
 */
export async function getGitHubToken(db: Database, userId: string): Promise<string | null> {
  const [tokenRecord] = await db
    .select()
    .from(githubTokens)
    .where(eq(githubTokens.userId, userId))
    .limit(1)

  if (!tokenRecord) return null

  return decryptToken(tokenRecord.encryptedToken)
}

/**
 * Make an authenticated GitHub API request
 */
async function githubFetch(
  token: string,
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> {
  const response = await fetch(`${GITHUB_API}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...options.headers,
    },
  })

  return response
}

/**
 * Get the current commit SHA for a branch
 */
async function getBranchSha(
  token: string,
  owner: string,
  repo: string,
  branch: string
): Promise<string> {
  const response = await githubFetch(
    token,
    `/repos/${owner}/${repo}/git/ref/heads/${branch}`
  )

  if (!response.ok) {
    throw new Error(`Failed to get branch: ${await response.text()}`)
  }

  const data = (await response.json()) as { object: { sha: string } }
  return data.object.sha
}

/**
 * Create a blob for a file
 */
async function createBlob(
  token: string,
  owner: string,
  repo: string,
  content: string
): Promise<string> {
  const response = await githubFetch(token, `/repos/${owner}/${repo}/git/blobs`, {
    method: 'POST',
    body: JSON.stringify({
      content: Buffer.from(content).toString('base64'),
      encoding: 'base64',
    }),
  })

  if (!response.ok) {
    throw new Error(`Failed to create blob: ${await response.text()}`)
  }

  const data = (await response.json()) as { sha: string }
  return data.sha
}

/**
 * Create a tree with the new files
 */
async function createTree(
  token: string,
  owner: string,
  repo: string,
  baseSha: string,
  files: Array<{ path: string; blobSha: string }>
): Promise<string> {
  const tree = files.map((f) => ({
    path: f.path,
    mode: '100644',
    type: 'blob',
    sha: f.blobSha,
  }))

  const response = await githubFetch(token, `/repos/${owner}/${repo}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({
      base_tree: baseSha,
      tree,
    }),
  })

  if (!response.ok) {
    throw new Error(`Failed to create tree: ${await response.text()}`)
  }

  const data = (await response.json()) as { sha: string }
  return data.sha
}

/**
 * Create a commit
 */
async function createCommit(
  token: string,
  owner: string,
  repo: string,
  message: string,
  treeSha: string,
  parentSha: string
): Promise<string> {
  const response = await githubFetch(token, `/repos/${owner}/${repo}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({
      message,
      tree: treeSha,
      parents: [parentSha],
    }),
  })

  if (!response.ok) {
    throw new Error(`Failed to create commit: ${await response.text()}`)
  }

  const data = (await response.json()) as { sha: string }
  return data.sha
}

/**
 * Update a branch reference to point to a new commit
 */
async function updateBranchRef(
  token: string,
  owner: string,
  repo: string,
  branch: string,
  commitSha: string
): Promise<void> {
  const response = await githubFetch(
    token,
    `/repos/${owner}/${repo}/git/refs/heads/${branch}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        sha: commitSha,
      }),
    }
  )

  if (!response.ok) {
    throw new Error(`Failed to update branch: ${await response.text()}`)
  }
}

/**
 * Commit files to a GitHub repository
 */
export async function commitToGitHub(
  db: Database,
  workspaceId: string,
  files: GitHubFile[],
  message: string
): Promise<CommitResult> {
  // Get workspace
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1)

  if (!workspace) throw new Error('Workspace not found')

  // Get token
  const token = await getGitHubToken(db, workspace.ownerId)
  if (!token) throw new Error('No GitHub token found')

  // Parse repo
  const [owner, repo] = workspace.githubRepo.split('/')
  if (!owner || !repo) throw new Error('Invalid repo format')

  const branch = workspace.githubBranch

  // Get current branch SHA
  const branchSha = await getBranchSha(token, owner, repo, branch)

  // Create blobs for all files
  const fileBlobs = await Promise.all(
    files.map(async (file) => ({
      path: file.path.startsWith('/') ? file.path.slice(1) : file.path,
      blobSha: await createBlob(token, owner, repo, file.content),
    }))
  )

  // Create tree
  const treeSha = await createTree(token, owner, repo, branchSha, fileBlobs)

  // Create commit
  const commitSha = await createCommit(token, owner, repo, message, treeSha, branchSha)

  // Update branch reference
  await updateBranchRef(token, owner, repo, branch, commitSha)

  return {
    sha: commitSha,
    url: `https://github.com/${owner}/${repo}/commit/${commitSha}`,
  }
}

/**
 * List files in a repository path
 */
export async function listRepositoryFiles(
  db: Database,
  userId: string,
  owner: string,
  repo: string,
  path: string = '',
  branch: string = 'main'
): Promise<Array<{ name: string; path: string; type: 'file' | 'dir' }>> {
  const token = await getGitHubToken(db, userId)
  if (!token) throw new Error('No GitHub token found')

  const response = await githubFetch(
    token,
    `/repos/${owner}/${repo}/contents/${path}?ref=${branch}`
  )

  if (!response.ok) {
    throw new Error(`Failed to list files: ${await response.text()}`)
  }

  const data = (await response.json()) as
    | Array<{ name: string; path: string; type: string }>
    | { name: string; path: string; type: string }

  if (!Array.isArray(data)) {
    // Single file
    return [{ name: data.name, path: data.path, type: 'file' }]
  }

  return data.map((item: { name: string; path: string; type: string }) => ({
    name: item.name,
    path: item.path,
    type: item.type === 'dir' ? 'dir' : 'file',
  }))
}

/**
 * Get file content from a repository
 */
export async function getFileContent(
  db: Database,
  userId: string,
  owner: string,
  repo: string,
  path: string,
  branch: string = 'main'
): Promise<string> {
  const token = await getGitHubToken(db, userId)
  if (!token) throw new Error('No GitHub token found')

  const response = await githubFetch(
    token,
    `/repos/${owner}/${repo}/contents/${path}?ref=${branch}`
  )

  if (!response.ok) {
    throw new Error(`Failed to get file: ${await response.text()}`)
  }

  const data = (await response.json()) as { encoding: string; content: string }

  if (data.encoding === 'base64') {
    return Buffer.from(data.content, 'base64').toString('utf8')
  }

  return data.content
}

/**
 * List user's repositories
 */
export async function listUserRepos(
  db: Database,
  userId: string
): Promise<Array<{ name: string; full_name: string; description: string | null; private: boolean }>> {
  const token = await getGitHubToken(db, userId)
  if (!token) throw new Error('No GitHub token found')

  const response = await githubFetch(token, '/user/repos?per_page=100&sort=updated')

  if (!response.ok) {
    throw new Error(`Failed to list repos: ${await response.text()}`)
  }

  const data = (await response.json()) as Array<{
    name: string
    full_name: string
    description: string | null
    private: boolean
  }>

  return data.map((repo) => ({
    name: repo.name,
    full_name: repo.full_name,
    description: repo.description,
    private: repo.private,
  }))
}
