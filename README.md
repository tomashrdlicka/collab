# Collab

Collaborative markdown editing for AI agents and developers.

## Features

- **Real-time collaboration** - Edit documents with teammates simultaneously
- **Local sync** - CLI daemon syncs files bidirectionally with the server
- **Auto GitHub commits** - Changes auto-commit with AI-generated messages
- **Agent-optimized** - Designed for Claude Code and other AI coding agents

## Architecture

```
apps/
  web/       - Next.js web application
  server/    - Hocuspocus sync server
  cli/       - Node.js CLI daemon

packages/
  shared/    - Shared types, schemas, constants
  sync/      - Yjs document utilities
  db/        - Drizzle database schema
```

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker (for local database)

### Setup

1. Clone and install dependencies:

```bash
pnpm install
```

2. Start local services (Postgres, Redis):

```bash
docker compose up -d
```

3. Set up environment variables:

```bash
cp .env.example .env
# Edit .env with your values
```

4. Run database migrations:

```bash
pnpm db:push
```

5. Start development servers:

```bash
pnpm dev
```

This starts:
- Web app at http://localhost:3000
- Sync server at ws://localhost:1234

### CLI Usage

```bash
# Install CLI globally
pnpm --filter @collab/cli link --global

# Authenticate with GitHub
collab login

# Link a directory to a workspace
collab init

# Start syncing files
collab watch

# Check sync status
collab status

# Manual commit
collab commit

# Open workspace in browser
collab open
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `NEXTAUTH_URL` | Base URL for the web app |
| `NEXTAUTH_SECRET` | Secret for NextAuth sessions |
| `GITHUB_CLIENT_ID` | GitHub OAuth app client ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth app client secret |
| `ENCRYPTION_KEY` | 32-byte base64 key for token encryption |
| `ANTHROPIC_API_KEY` | Claude API key for commit messages |

## Development

### Project Structure

- `apps/web` - Next.js 14 app with App Router
- `apps/server` - Hocuspocus WebSocket server
- `apps/cli` - Commander.js CLI application
- `packages/shared` - Shared TypeScript types and Zod schemas
- `packages/sync` - Yjs document utilities
- `packages/db` - Drizzle ORM schema and migrations

### Tech Stack

- **Framework**: Next.js 14
- **Editor**: CodeMirror 6
- **Real-time**: Yjs + Hocuspocus
- **Database**: PostgreSQL + Drizzle ORM
- **Auth**: NextAuth.js with GitHub OAuth
- **Styling**: Tailwind CSS
- **Monorepo**: Turborepo + pnpm

## License

MIT
