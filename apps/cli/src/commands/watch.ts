import chalk from 'chalk'
import ora from 'ora'
import { isAuthenticated, getToken, getUser } from '../auth/keychain'
import { findWorkspaceConfig, getWsUrl } from '../auth/config'
import { createSyncClient } from '../sync/client'

interface WatchOptions {
  daemon?: boolean
}

export async function watchCommand(options: WatchOptions): Promise<void> {
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

  const token = await getToken()
  const user = await getUser()

  if (!token || !user) {
    console.log(chalk.red('Authentication error. Try logging in again.'))
    process.exit(1)
  }

  console.log(chalk.blue(`\nWatching ${config.workspaceName}`))
  console.log(chalk.gray(`Path: ${config.localPath}`))
  console.log(chalk.gray('Press Ctrl+C to stop\n'))

  const spinner = ora('Connecting...').start()

  try {
    const client = await createSyncClient({
      workspaceId: config.workspaceId,
      localPath: config.localPath,
      wsUrl: getWsUrl(),
      token,
      userId: user.id,
      userName: user.username,
      onConnected: () => {
        spinner.succeed('Connected')
        console.log(chalk.green('Syncing files...'))
      },
      onDisconnected: () => {
        console.log(chalk.yellow('\nDisconnected. Reconnecting...'))
      },
      onFileChange: (path, type) => {
        const icon = type === 'add' ? '+' : type === 'remove' ? '-' : '~'
        const color = type === 'add' ? chalk.green : type === 'remove' ? chalk.red : chalk.yellow
        console.log(color(`${icon} ${path}`))
      },
      onError: (error) => {
        console.error(chalk.red(`Error: ${error.message}`))
      },
    })

    // Handle shutdown
    const shutdown = async () => {
      console.log(chalk.gray('\n\nStopping...'))
      await client.stop()
      process.exit(0)
    }

    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)

    // Start watching
    await client.start()
  } catch (error) {
    spinner.fail('Failed to start')
    console.error(chalk.red(`\nError: ${error instanceof Error ? error.message : 'Unknown error'}`))
    process.exit(1)
  }
}
