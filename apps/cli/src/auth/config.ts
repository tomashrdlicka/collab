import Conf from 'conf'
import * as path from 'path'
import * as fs from 'fs'

interface WorkspaceConfig {
  workspaceId: string
  workspaceName: string
  workspaceSlug: string
  localPath: string
}

interface Config {
  apiUrl: string
  wsUrl: string
  workspaces: Record<string, WorkspaceConfig>
}

const config = new Conf<Config>({
  projectName: 'collab',
  defaults: {
    apiUrl: process.env.COLLAB_API_URL ?? 'http://localhost:3000',
    wsUrl: process.env.COLLAB_WS_URL ?? 'ws://localhost:1234',
    workspaces: {},
  },
})

export function getApiUrl(): string {
  return config.get('apiUrl')
}

export function getWsUrl(): string {
  return config.get('wsUrl')
}

export function setApiUrl(url: string): void {
  config.set('apiUrl', url)
}

export function setWsUrl(url: string): void {
  config.set('wsUrl', url)
}

/**
 * Get workspace config for a directory
 */
export function getWorkspaceConfig(directory: string): WorkspaceConfig | null {
  const workspaces = config.get('workspaces')
  const absolutePath = path.resolve(directory)
  return workspaces[absolutePath] ?? null
}

/**
 * Set workspace config for a directory
 */
export function setWorkspaceConfig(
  directory: string,
  workspace: Omit<WorkspaceConfig, 'localPath'>
): void {
  const absolutePath = path.resolve(directory)
  const workspaces = config.get('workspaces')
  workspaces[absolutePath] = {
    ...workspace,
    localPath: absolutePath,
  }
  config.set('workspaces', workspaces)
}

/**
 * Remove workspace config for a directory
 */
export function removeWorkspaceConfig(directory: string): void {
  const absolutePath = path.resolve(directory)
  const workspaces = config.get('workspaces')
  delete workspaces[absolutePath]
  config.set('workspaces', workspaces)
}

/**
 * Find workspace config by looking up directory tree
 */
export function findWorkspaceConfig(startDirectory: string): WorkspaceConfig | null {
  let current = path.resolve(startDirectory)
  const root = path.parse(current).root

  while (current !== root) {
    const workspace = getWorkspaceConfig(current)
    if (workspace) {
      return workspace
    }
    current = path.dirname(current)
  }

  return null
}

/**
 * Check if a directory is linked to a workspace
 */
export function isLinked(directory: string): boolean {
  return getWorkspaceConfig(directory) !== null
}

/**
 * Get all linked workspaces
 */
export function getAllWorkspaces(): WorkspaceConfig[] {
  const workspaces = config.get('workspaces')
  return Object.values(workspaces)
}

/**
 * Create a .collab config file in a directory
 */
export function createLocalConfig(directory: string, workspaceId: string): void {
  const configPath = path.join(directory, '.collab')
  fs.writeFileSync(
    configPath,
    JSON.stringify({ workspaceId }, null, 2),
    'utf-8'
  )
}

/**
 * Read .collab config from a directory
 */
export function readLocalConfig(directory: string): { workspaceId: string } | null {
  const configPath = path.join(directory, '.collab')
  if (!fs.existsSync(configPath)) {
    return null
  }
  try {
    const content = fs.readFileSync(configPath, 'utf-8')
    return JSON.parse(content)
  } catch {
    return null
  }
}
