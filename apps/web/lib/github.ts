import type { Database } from '@collab/db'
import { githubTokens, workspaces } from '@collab/db/schema'
import { eq } from 'drizzle-orm'
import { decryptToken } from '@collab/shared'

const GITHUB_API = 'https://api.github.com'

interface GitHubFile {
  path: string
  content: string
}

interface CommitResult {
  sha: string
  url: string
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

async function getBranchSha(token: string, owner: string, repo: string, branch: string): Promise<string> {
  const response = await githubFetch(token, `/repos/${owner}/${repo}/git/ref/heads/${branch}`)
  if (!response.ok) throw new Error(`Failed to get branch: ${await response.text()}`)
  const data = await response.json()
  return data.object.sha
}

async function createBlob(token: string, owner: string, repo: string, content: string): Promise<string> {
  const response = await githubFetch(token, `/repos/${owner}/${repo}/git/blobs`, {
    method: 'POST',
    body: JSON.stringify({ content: Buffer.from(content).toString('base64'), encoding: 'base64' }),
  })
  if (!response.ok) throw new Error(`Failed to create blob: ${await response.text()}`)
  const data = await response.json()
  return data.sha
}

async function createTree(
  token: string, owner: string, repo: string, baseSha: string,
  files: Array<{ path: string; blobSha: string }>
): Promise<string> {
  const tree = files.map((f) => ({ path: f.path, mode: '100644', type: 'blob', sha: f.blobSha }))
  const response = await githubFetch(token, `/repos/${owner}/${repo}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({ base_tree: baseSha, tree }),
  })
  if (!response.ok) throw new Error(`Failed to create tree: ${await response.text()}`)
  const data = await response.json()
  return data.sha
}

async function createCommit(
  token: string, owner: string, repo: string, message: string, treeSha: string, parentSha: string
): Promise<string> {
  const response = await githubFetch(token, `/repos/${owner}/${repo}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({ message, tree: treeSha, parents: [parentSha] }),
  })
  if (!response.ok) throw new Error(`Failed to create commit: ${await response.text()}`)
  const data = await response.json()
  return data.sha
}

async function updateBranchRef(token: string, owner: string, repo: string, branch: string, commitSha: string): Promise<void> {
  const response = await githubFetch(token, `/repos/${owner}/${repo}/git/refs/heads/${branch}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commitSha }),
  })
  if (!response.ok) throw new Error(`Failed to update branch: ${await response.text()}`)
}

export async function commitToGitHub(
  db: Database,
  workspaceId: string,
  files: GitHubFile[],
  message: string
): Promise<CommitResult> {
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1)

  if (!workspace) throw new Error('Workspace not found')

  const token = await getGitHubToken(db, workspace.ownerId)
  if (!token) throw new Error('No GitHub token found')

  const [owner, repo] = workspace.githubRepo.split('/')
  if (!owner || !repo) throw new Error('Invalid repo format')

  const branch = workspace.githubBranch
  const branchSha = await getBranchSha(token, owner, repo, branch)

  const fileBlobs = await Promise.all(
    files.map(async (file) => ({
      path: file.path.startsWith('/') ? file.path.slice(1) : file.path,
      blobSha: await createBlob(token, owner, repo, file.content),
    }))
  )

  const treeSha = await createTree(token, owner, repo, branchSha, fileBlobs)
  const commitSha = await createCommit(token, owner, repo, message, treeSha, branchSha)
  await updateBranchRef(token, owner, repo, branch, commitSha)

  return {
    sha: commitSha,
    url: `https://github.com/${owner}/${repo}/commit/${commitSha}`,
  }
}
