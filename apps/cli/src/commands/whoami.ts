import chalk from 'chalk'
import { getUser, isAuthenticated } from '../auth/keychain'

export async function whoamiCommand(): Promise<void> {
  const authenticated = await isAuthenticated()

  if (!authenticated) {
    console.log(chalk.yellow('Not logged in. Run "collab login" to authenticate.'))
    return
  }

  const user = await getUser()

  if (!user) {
    console.log(chalk.yellow('User info not found. Try logging in again.'))
    return
  }

  console.log(chalk.green(`@${user.username}`))
}
