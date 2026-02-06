import chalk from 'chalk'
import ora from 'ora'
import { isAuthenticated, getToken } from '../auth/keychain'
import { findWorkspaceConfig, getApiUrl } from '../auth/config'

interface CommitOptions {
  message?: string
}

export async function commitCommand(options: CommitOptions): Promise<void> {
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

  const spinner = ora('Committing changes...').start()

  try {
    const token = await getToken()
    const apiUrl = getApiUrl()

    const response = await fetch(`${apiUrl}/api/workspaces/${config.workspaceId}/commit`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: options.message,
      }),
    })

    if (!response.ok) {
      const data = (await response.json()) as { error?: { message?: string } }
      throw new Error(data.error?.message ?? 'Failed to commit')
    }

    const { data } = (await response.json()) as {
      data: { sha: string; message: string; filesChanged: number; url?: string }
    }

    spinner.succeed('Committed successfully!')

    console.log(chalk.green(`\nCommit: ${data.sha.slice(0, 7)}`))
    console.log(chalk.gray(`Message: ${data.message}`))
    console.log(chalk.gray(`Files: ${data.filesChanged} changed`))

    if (data.url) {
      console.log(chalk.blue(`\nView on GitHub: ${data.url}`))
    }
  } catch (error) {
    spinner.fail('Failed to commit')
    console.error(chalk.red(`\nError: ${error instanceof Error ? error.message : 'Unknown error'}`))
    process.exit(1)
  }
}
