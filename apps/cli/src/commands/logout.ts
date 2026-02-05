import chalk from 'chalk'
import { removeToken, removeUser, getUser } from '../auth/keychain'

export async function logoutCommand(): Promise<void> {
  const user = await getUser()

  if (!user) {
    console.log(chalk.yellow('Not logged in.'))
    return
  }

  await removeToken()
  await removeUser()

  console.log(chalk.green(`Logged out from @${user.username}`))
}
