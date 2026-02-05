import open from 'open'
import ora from 'ora'
import chalk from 'chalk'
import { storeToken, storeUser, getToken } from '../auth/keychain'
import { getApiUrl } from '../auth/config'

const POLL_INTERVAL = 2000 // 2 seconds
const MAX_POLL_TIME = 300000 // 5 minutes

export async function loginCommand(): Promise<void> {
  // Check if already logged in
  const existingToken = await getToken()
  if (existingToken) {
    console.log(chalk.yellow('Already logged in. Use "collab logout" to sign out first.'))
    return
  }

  const spinner = ora('Starting authentication...').start()

  try {
    const apiUrl = getApiUrl()

    // Start auth flow
    const startResponse = await fetch(`${apiUrl}/api/cli/auth/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceName: `CLI on ${process.platform}` }),
    })

    if (!startResponse.ok) {
      throw new Error('Failed to start authentication')
    }

    const { code, authUrl, expiresAt } = await startResponse.json()

    spinner.stop()

    // Open browser
    console.log(chalk.blue('\nOpening browser for authentication...'))
    console.log(chalk.gray(`If browser doesn't open, visit: ${authUrl}`))
    console.log(chalk.gray(`\nAuthentication code: ${chalk.bold(code)}\n`))

    await open(authUrl)

    // Poll for completion
    const pollSpinner = ora('Waiting for authentication...').start()
    const startTime = Date.now()

    while (Date.now() - startTime < MAX_POLL_TIME) {
      await sleep(POLL_INTERVAL)

      const pollResponse = await fetch(`${apiUrl}/api/cli/auth/poll/${code}`)

      if (!pollResponse.ok) {
        if (pollResponse.status === 404) {
          throw new Error('Authentication expired. Please try again.')
        }
        continue
      }

      const pollData = await pollResponse.json()

      if (pollData.status === 'completed' && pollData.token) {
        pollSpinner.succeed('Authentication successful!')

        // Store credentials
        await storeToken(pollData.token)
        await storeUser({
          id: pollData.userId,
          username: pollData.username,
        })

        console.log(chalk.green(`\nLogged in as @${pollData.username}`))
        return
      }

      if (pollData.status === 'expired') {
        throw new Error('Authentication expired. Please try again.')
      }

      // Update spinner
      const elapsed = Math.floor((Date.now() - startTime) / 1000)
      pollSpinner.text = `Waiting for authentication... (${elapsed}s)`
    }

    pollSpinner.fail('Authentication timed out')
    console.log(chalk.red('\nAuthentication timed out. Please try again.'))
  } catch (error) {
    spinner.fail('Authentication failed')
    console.error(chalk.red(`\nError: ${error instanceof Error ? error.message : 'Unknown error'}`))
    process.exit(1)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
