#!/usr/bin/env node
import { Command } from 'commander'
import { loginCommand } from './commands/login'
import { logoutCommand } from './commands/logout'
import { whoamiCommand } from './commands/whoami'
import { initCommand } from './commands/init'
import { watchCommand } from './commands/watch'
import { statusCommand } from './commands/status'
import { commitCommand } from './commands/commit'
import { openCommand } from './commands/open'

const program = new Command()

program
  .name('collab')
  .description('Collaborative markdown for AI agents')
  .version('0.1.0')

// Auth commands
program
  .command('login')
  .description('Sign in with GitHub')
  .action(loginCommand)

program
  .command('logout')
  .description('Sign out and remove stored credentials')
  .action(logoutCommand)

program
  .command('whoami')
  .description('Show current user')
  .action(whoamiCommand)

// Workspace commands
program
  .command('init')
  .description('Link current directory to a workspace')
  .option('-w, --workspace <id>', 'Workspace ID to link to')
  .action(initCommand)

program
  .command('watch')
  .description('Start syncing files')
  .option('-d, --daemon', 'Run in background')
  .action(watchCommand)

program
  .command('status')
  .description('Show sync status and uncommitted changes')
  .action(statusCommand)

program
  .command('commit')
  .description('Commit changes to GitHub')
  .option('-m, --message <message>', 'Custom commit message')
  .action(commitCommand)

program
  .command('open')
  .description('Open workspace in browser')
  .action(openCommand)

program.parse()
