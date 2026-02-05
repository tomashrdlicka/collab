import open from 'open'
import chalk from 'chalk'
import { isAuthenticated } from '../auth/keychain'
import { findWorkspaceConfig, getApiUrl } from '../auth/config'

export async function openCommand(): Promise<void> {
  // Check authentication
  if (!(await isAuthenticated())) {
    console.log(chalk.red('Not logged in. Run "collab login" first.'))
    process.exit(1)
  }

  // Find workspace config
  const config = findWorkspaceConfig(process.cwd())
  if (!config) {
    console.log(chalk.red('Not linked to a workspace. Run "collab init" first.'))
    process.exit(1)
  }

  const apiUrl = getApiUrl()
  const workspaceUrl = `${apiUrl.replace('/api', '')}/w/${config.workspaceSlug}`

  console.log(chalk.blue(`Opening ${config.workspaceName}...`))
  await open(workspaceUrl)
}
