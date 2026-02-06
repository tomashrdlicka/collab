import chalk from 'chalk'
import ora from 'ora'
import { isAuthenticated, getToken } from '../auth/keychain'
import { findWorkspaceConfig, getApiUrl } from '../auth/config'

export async function statusCommand(): Promise<void> {
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

  const spinner = ora('Fetching status...').start()

  try {
    const token = await getToken()
    const apiUrl = getApiUrl()

    // Fetch uncommitted changes
    const response = await fetch(
      `${apiUrl}/api/workspaces/${config.workspaceId}/changes/uncommitted`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    )

    if (!response.ok) {
      throw new Error('Failed to fetch status')
    }

    const { data: changes } = (await response.json()) as {
      data: Array<{ changeType: string; documentPath: string }>
    }

    spinner.stop()

    console.log(chalk.blue(`\n${config.workspaceName}`))
    console.log(chalk.gray(`Path: ${config.localPath}\n`))

    if (changes.length === 0) {
      console.log(chalk.green('No uncommitted changes'))
    } else {
      console.log(chalk.yellow(`${changes.length} uncommitted change${changes.length > 1 ? 's' : ''}:\n`))

      for (const change of changes) {
        const icon = change.changeType === 'create' ? '+' : change.changeType === 'delete' ? '-' : '~'
        const color =
          change.changeType === 'create'
            ? chalk.green
            : change.changeType === 'delete'
            ? chalk.red
            : chalk.yellow

        console.log(color(`  ${icon} ${change.documentPath}`))
      }

      console.log(chalk.gray('\nRun "collab commit" to commit changes to GitHub'))
    }
  } catch (error) {
    spinner.fail('Failed to fetch status')
    console.error(chalk.red(`\nError: ${error instanceof Error ? error.message : 'Unknown error'}`))
    process.exit(1)
  }
}
