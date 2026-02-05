import inquirer from 'inquirer'
import chalk from 'chalk'
import ora from 'ora'
import * as path from 'path'
import { isAuthenticated, getToken } from '../auth/keychain'
import { getApiUrl, setWorkspaceConfig, getWorkspaceConfig, createLocalConfig } from '../auth/config'

interface InitOptions {
  workspace?: string
}

export async function initCommand(options: InitOptions): Promise<void> {
  // Check authentication
  if (!(await isAuthenticated())) {
    console.log(chalk.red('Not logged in. Run "collab login" first.'))
    process.exit(1)
  }

  const currentDir = process.cwd()

  // Check if already linked
  const existingConfig = getWorkspaceConfig(currentDir)
  if (existingConfig) {
    console.log(chalk.yellow(`Already linked to workspace "${existingConfig.workspaceName}"`))
    const { overwrite } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'overwrite',
        message: 'Do you want to link to a different workspace?',
        default: false,
      },
    ])
    if (!overwrite) {
      return
    }
  }

  const spinner = ora('Fetching workspaces...').start()

  try {
    const token = await getToken()
    const apiUrl = getApiUrl()

    // Fetch user's workspaces
    const response = await fetch(`${apiUrl}/api/workspaces`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      throw new Error('Failed to fetch workspaces')
    }

    const { data: workspaces } = await response.json()

    spinner.stop()

    if (workspaces.length === 0) {
      console.log(chalk.yellow('\nNo workspaces found.'))
      console.log(chalk.gray('Create a workspace at https://collab.dev/dashboard/new'))
      return
    }

    let selectedWorkspace

    if (options.workspace) {
      // Find workspace by ID or slug
      selectedWorkspace = workspaces.find(
        (w: { id: string; slug: string }) =>
          w.id === options.workspace || w.slug === options.workspace
      )
      if (!selectedWorkspace) {
        console.log(chalk.red(`Workspace "${options.workspace}" not found.`))
        process.exit(1)
      }
    } else {
      // Interactive selection
      const { workspace } = await inquirer.prompt([
        {
          type: 'list',
          name: 'workspace',
          message: 'Select a workspace to link:',
          choices: workspaces.map((w: { id: string; name: string; githubRepo: string }) => ({
            name: `${w.name} (${w.githubRepo})`,
            value: w,
          })),
        },
      ])
      selectedWorkspace = workspace
    }

    // Save config
    setWorkspaceConfig(currentDir, {
      workspaceId: selectedWorkspace.id,
      workspaceName: selectedWorkspace.name,
      workspaceSlug: selectedWorkspace.slug,
    })

    // Create local .collab file
    createLocalConfig(currentDir, selectedWorkspace.id)

    console.log(chalk.green(`\nLinked ${path.basename(currentDir)} to "${selectedWorkspace.name}"`))
    console.log(chalk.gray('\nRun "collab watch" to start syncing files.'))
  } catch (error) {
    spinner.fail('Failed to initialize')
    console.error(chalk.red(`\nError: ${error instanceof Error ? error.message : 'Unknown error'}`))
    process.exit(1)
  }
}
