# Collab - Project Status

Last updated: 2026-02-06

## What's Been Built (MVP Complete)

### Core Platform
- **Real-time collaborative markdown editing** via Yjs CRDTs over WebSocket (Hocuspocus v2.15.3)
- **GitHub OAuth authentication** via NextAuth.js (JWT strategy, `repo` scope for commits)
- **PostgreSQL database** with Drizzle ORM: users, workspaces, documents, changes, members, share links, tokens, conflicts
- **AES-256-GCM token encryption** for GitHub access tokens at rest

### Features
1. **Workspace CRUD** - Create/update workspaces linked to GitHub repos
2. **Document editing** - Real-time collaborative markdown with presence (cursors, selections)
3. **Auto-commit to GitHub** - Background service with idle/max timers, daily limits, AI-generated commit messages (Claude Haiku)
4. **Manual commit** - Commit button with message input, diff preview, SHA + GitHub link on success
5. **Change tracking** - Document changes with diff computation, uncommitted/committed grouping
6. **Member management** - Owner/editor/viewer roles, add by GitHub username
7. **Share links** - Permission-based links with optional expiry, max uses, GitHub auth requirement
8. **Slack notifications** - Webhook integration for changes, commits, collaborators, conflicts
9. **CLI daemon** - Local file sync, device auth flow, commit/status commands
10. **Conflict detection** - Concurrent edit detection with resolution support

### 15 API Routes
| Route | Methods | Purpose |
|-------|---------|---------|
| `/api/auth/[...nextauth]` | GET, POST | NextAuth.js handler |
| `/api/workspaces` | GET, POST | List/create workspaces |
| `/api/workspaces/[id]` | GET, PATCH | Get/update workspace |
| `/api/workspaces/[id]/documents` | GET, POST | List/create documents |
| `/api/workspaces/[id]/changes` | GET | List all changes (paginated) |
| `/api/workspaces/[id]/changes/uncommitted` | GET | Uncommitted changes only |
| `/api/workspaces/[id]/commit` | POST | Manual commit to GitHub |
| `/api/workspaces/[id]/members` | GET, POST | List/add members |
| `/api/workspaces/[id]/members/[userId]` | PATCH, DELETE | Update role/remove member |
| `/api/workspaces/[id]/share-links` | GET, POST | List/create share links |
| `/api/workspaces/[id]/share-links/[linkId]` | DELETE | Disable share link |
| `/api/cli/auth/start` | POST | Start CLI device auth |
| `/api/cli/auth/poll/[code]` | GET | Poll CLI auth status |
| `/api/cli/auth/confirm` | GET | Confirm CLI auth |
| `/api/join/[code]` | POST | Join workspace via share link |

---

## Test Suite (535 Tests)

All passing as of commit `28ece38`.

### Breakdown
- **@collab/shared**: Crypto, schemas, constants unit tests
- **@collab/sync**: Diff, sections, encoding unit tests
- **API routes**: 15 endpoints with mock DB infrastructure (`apps/web/app/api/__tests__/`)
- **UI components**: 8 workspace components (DiffViewer, HeaderActions, CommitButton, CommitModal, ShareModal, MemberList, Sidebar, CollabEditor)
- **CLI commands**: 8 commands (login, init, sync, status, commit, stop, config, help)

### Running Tests
```bash
pnpm test          # Run all 535 tests via Turborepo
pnpm test --filter @collab/shared   # Test specific package
pnpm test --filter @collab/web      # Test web app (API routes + components)
```

---

## Local Development Setup

### Prerequisites
- Node >= 20, pnpm 9+
- Docker (for PostgreSQL + Redis)

### Infrastructure Running
- **PostgreSQL 16** on port **5433** (Docker, not 5432 to avoid local PG conflict)
- **Redis 7** on port **6379** (Docker)
- **Next.js** on port **3000** (web frontend)
- **Hocuspocus** on port **1234** (WebSocket sync server)

### How to Start
```bash
# 1. Start Docker services
docker compose up -d

# 2. Push database schema
pnpm db:push

# 3. Start dev servers (web + sync server)
pnpm dev
# Or individually:
pnpm --filter @collab/web dev
pnpm --filter @collab/server dev
```

### Environment Variables (.env at monorepo root)
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/collab
REDIS_URL=redis://localhost:6379
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<generated base64 32-byte key>
GITHUB_CLIENT_ID=<from GitHub OAuth app>
GITHUB_CLIENT_SECRET=<from GitHub OAuth app>
ENCRYPTION_KEY=<generated base64 32-byte key>
ANTHROPIC_API_KEY=<optional, for AI commit messages>
HOCUSPOCUS_URL=ws://localhost:1234
```

### GitHub OAuth App Setup
- **Homepage URL**: `http://localhost:3000`
- **Authorization callback URL**: `http://localhost:3000/api/auth/callback/github`
- Scopes requested: `read:user user:email repo`

---

## Uncommitted Changes (Working Tree)

These changes haven't been committed yet:

1. **`apps/web/next.config.js`** - Added `dotenv` loading from monorepo root `.env` (fixes GitHub OAuth env vars not being available to Next.js)
2. **`apps/web/package.json`** - Added `dotenv` as devDependency
3. **`apps/server/src/index.ts`** - Uses explicit path for dotenv loading (`resolve(import.meta.dirname, '../../../.env')`)
4. **`apps/server/package.json`** - drizzle-orm version bump
5. **`docker-compose.yml`** - PostgreSQL port changed from 5432 to 5433
6. **`packages/db/drizzle.config.ts`** - Updated for drizzle-kit 0.30.5 format (`dialect: 'postgresql'`, `url` instead of `connectionString`)
7. **`packages/db/package.json`** - Upgraded drizzle-orm 0.44.2, drizzle-kit 0.30.5, added dotenv
8. **`pnpm-lock.yaml`** - Updated lockfile

---

## What Needs Testing (E2E Manual Flow)

The full flow to test end-to-end:

1. **Login** - Go to http://localhost:3000/login, click "Continue with GitHub"
2. **Create workspace** - Should redirect to dashboard, create a new workspace linked to a GitHub repo
3. **Edit a document** - Open the collaborative editor, make changes
4. **Check presence** - Open in two browser tabs, verify cursors show
5. **Auto-commit** - Wait for idle timer, verify commit appears on GitHub
6. **Manual commit** - Use the commit button, verify diff preview, submit, check GitHub
7. **Share link** - Create a share link, open in incognito, join workspace
8. **Member management** - Add/remove members, change roles
9. **Change tracking** - Verify sidebar shows modified/new badges
10. **CLI auth** - Run CLI login, confirm in browser, verify token works

---

## Known Issues

### Active
- **CLI `y-websocket` import error** - Pre-existing. `WebsocketProvider` export not found. CLI sync command won't work until this is resolved. Other CLI commands (login, status, commit) should work.
- **GitHub OAuth callback URL** - Must be configured in the GitHub OAuth app settings to `http://localhost:3000/api/auth/callback/github`. If not set, the OAuth flow will fail silently.

### Resolved This Session
- Fixed 32 pre-existing type errors (14 CLI + 18 server)
- Fixed `.env` not loading in Next.js (added dotenv in `next.config.js`)
- Fixed Docker PostgreSQL port conflict (5432 -> 5433)
- Upgraded drizzle-orm/drizzle-kit for compatibility
- Fixed server dotenv loading path

### Pre-existing (Not Addressed)
- No E2E test suite (only unit + integration with mocks)
- No rate limiting middleware
- No conflict resolution UI (detection exists, UI doesn't)

---

## Architecture Quick Reference

```
Browser (localhost:3000)
  |
  |-- Next.js API Routes (/api/*) -- PostgreSQL (5433)
  |                                    |
  |-- WebSocket (ws://localhost:1234)  |
  |       |                            |
  |   Hocuspocus Sync Server ----------+
  |       |
  |   Yjs CRDT Documents
  |       |
  |   Auto-commit service --> GitHub REST API
  |
  |-- NextAuth.js --> GitHub OAuth
```

### Package Dependencies
```
@collab/shared (types, schemas, constants, crypto)
    ^
    |
@collab/db (Drizzle schema, depends on shared for types)
    ^
    |
@collab/sync (Yjs helpers, diff, section parsing)

apps/web    --> shared, db, sync
apps/server --> shared, db, sync
apps/cli    --> shared, sync
```

---

## Git History

```
28ece38 test: fix all type errors and add comprehensive test suite (535 tests)
3840563 feat: initial commit - collaborative markdown platform for AI agents
```

Plus uncommitted working tree changes for dev environment setup.

---

## Next Steps (Priority Order)

1. **Commit dev environment changes** - The dotenv fix, port change, drizzle upgrades
2. **Test GitHub OAuth flow** - Verify login works end-to-end with the env fix
3. **Manual E2E testing** - Walk through the full flow (create workspace, edit, commit, share)
4. **Fix CLI y-websocket import** - Needed for local file sync feature
5. **Add E2E test suite** - Playwright for browser automation
6. **Conflict resolution UI** - Side-by-side merge interface
7. **Rate limiting** - Middleware for API routes
