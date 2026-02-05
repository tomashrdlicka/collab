# Collab - Collaborative Markdown for AI Agents

Real-time collaborative markdown platform optimized for AI agent workflows. Web editor with live cursors, CLI daemon for local file sync, auto-commits to GitHub, review UX, share links, and Slack notifications.

## Quick Start

```bash
pnpm install          # Install dependencies
pnpm build            # Build all packages
pnpm dev              # Run dev servers (web + sync server)
pnpm typecheck        # Type-check all packages
pnpm db:push          # Push schema to database
pnpm db:studio        # Open Drizzle Studio
```

Requires Node >= 20, pnpm 9+.

## Monorepo Structure

```
collab/
  apps/
    web/        - Next.js 14 App Router frontend (@collab/web)
    server/     - Hocuspocus WebSocket sync server (@collab/server)
    cli/        - CLI daemon for local file sync (@collab/cli)
  packages/
    shared/     - Types, schemas, constants, crypto (@collab/shared)
    db/         - Drizzle ORM schema + migrations (@collab/db)
    sync/       - Yjs helpers, diff, section parsing (@collab/sync)
```

Built with pnpm workspaces + Turborepo.

## Architecture

- **Real-time sync**: Yjs CRDTs over WebSocket via Hocuspocus
- **Database**: PostgreSQL via Drizzle ORM
- **Auth**: GitHub OAuth via NextAuth.js (JWT strategy)
- **Token storage**: AES-256-GCM encryption (`ENCRYPTION_KEY` env var)
- **GitHub commits**: REST API (blobs -> tree -> commit -> update ref)
- **Presence**: Redis for cursor/user tracking
- **AI commit messages**: Claude API (Haiku) with fallback to template

## Critical Dependency Rule

**NEVER add `@collab/db` as a dependency of `@collab/shared`.**

This creates a cyclic dependency (`shared -> db -> shared`). The `@collab/shared` package is lightweight: types, schemas, constants, crypto only. Anything needing database access belongs in the app layer.

GitHub API functions that need DB access live in each app separately:
- `apps/server/src/services/github.ts` - server-side
- `apps/web/lib/github.ts` - web app (Next.js API routes)

Both import `decryptToken` from `@collab/shared`.

## Package Details

### @collab/shared (`packages/shared/`)
- `types.ts` - TypeScript interfaces and type definitions
- `schemas.ts` - Zod validation schemas (workspace, member, share link, commit, CLI auth)
- `constants.ts` - Sync settings, API paths, error codes, presence colors, regex patterns
- `crypto.ts` - `encryptToken()` / `decryptToken()` using AES-256-GCM

### @collab/db (`packages/db/`)
- Drizzle ORM schema: `users`, `workspaces`, `workspaceMembers`, `documents`, `documentChanges`, `githubTokens`, `shareLinks`, `cliAuthCodes`, `slackIntegrations`
- Depends on `@collab/shared` for types

### @collab/sync (`packages/sync/`)
- `encodeDocState` / `decodeDocState` - Yjs state serialization
- `getDocContent` - Extract text from Yjs doc
- `computeContentHash` - SHA-256 content hashing
- `getDiffPreview` / `getDiffSummary` / `formatUnifiedDiff` - Line-level diffs via LCS
- `parseSections` / `parseFrontmatter` - Markdown section parsing with context markers

### @collab/server (`apps/server/`)
- `src/index.ts` - Entry point, starts Hocuspocus + commit service
- `src/extensions/persistence.ts` - Document save/load with change tracking, diff preview, Slack notifications
- `src/services/commit.ts` - Auto-commit service (idle/max timers, daily limits, AI messages)
- `src/services/github.ts` - GitHub API (commit, blob, tree, ref operations)
- `src/services/slack.ts` - Slack webhook notifications (fire-and-forget)

### @collab/web (`apps/web/`)
- Next.js 14 App Router with server + client components
- Auth: `lib/auth.ts` (NextAuth config with GitHub provider)
- DB: `lib/db.ts` (database connection helper)
- GitHub: `lib/github.ts` (commit functions for API routes)

## API Routes (apps/web/app/api/)

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
| `/api/cli/auth/confirm` | GET | Confirm CLI auth (session required) |
| `/api/join/[code]` | POST | Join workspace via share link |

## API Route Patterns

All API routes follow this pattern:
```typescript
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDatabase } from '@/lib/db'

export async function METHOD(request: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: { code: 'UNAUTHORIZED', message: '...' } }, { status: 401 })

  const db = getDatabase()

  // Membership check: owner first, then workspaceMembers query
  const isOwner = workspace.ownerId === session.user.id
  if (!isOwner) { /* check workspaceMembers */ }

  // Zod validation for request body
  const parsed = someSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: { code: 'VALIDATION_ERROR', ... } }, { status: 400 })

  // Return: { data: ... } on success, { error: { code, message } } on failure
}
```

## UI Components

### Workspace components (`apps/web/components/workspace/`)
- `ShareModal.tsx` - Create/manage share links with permission control
- `HeaderActions.tsx` - Header bar with Share button (hidden for viewers)
- `DiffViewer.tsx` - Unified diff renderer with colored lines
- `CommitModal.tsx` - Commit flow: message input, loading/success/error, SHA + GitHub link
- `CommitButton.tsx` - "Commit N changes" button, opens CommitModal
- `MemberList.tsx` - Member management: list, role dropdown, add/remove

### Pages
- `/w/[slug]` - Workspace home with changes view (uncommitted/committed groups)
- `/w/[slug]/settings` - Settings page (owner-only): name, auto-commit config, members
- `/join/[code]` - Join workspace via share link
- `/login` - GitHub OAuth sign-in (supports `cli_code` param for CLI auth)

### Context
- `useWorkspace()` hook provides `{ workspace, user }` from `workspace-provider.tsx`

## Notifications Pattern

Fire-and-forget with error swallowing:
```typescript
notifyDocumentChanges(db, workspaceId, changes).catch(console.error)
notifyCommit(db, workspaceId, commitInfo).catch(console.error)
```

## Environment Variables

```
# Database
DATABASE_URL=postgresql://...

# Auth
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
NEXTAUTH_SECRET=...
NEXTAUTH_URL=http://localhost:3000

# Encryption
ENCRYPTION_KEY=<base64-encoded 32-byte key>

# AI (optional, for commit messages)
ANTHROPIC_API_KEY=...

# Redis (for presence)
REDIS_URL=redis://...

# Slack (optional)
SLACK_WEBHOOK_URL=https://hooks.slack.com/...
```

## Known Issues

### Pre-existing typecheck errors (not from MVP implementation)
- CLI package: `data unknown` errors from untyped `.json()` responses
- Server: `presence.ts` type mismatches
- Server/Web: `Date` vs `string` on `dailyCommitResetAt`
- drizzle-orm module resolution warnings (mitigated with `--external` flag)

### Missing: Tests
No tests exist yet. Test suite needs to be written covering:
- Unit tests for `@collab/shared` (crypto, schemas, constants)
- Unit tests for `@collab/sync` (diff, sections, encoding)
- API route integration tests (all 15 endpoints)
- Component tests for workspace UI components
- Server service tests (commit service, persistence, GitHub API)

## What Was Built (MVP Milestones)

1. **GitHub Commits** - Real commits via GitHub REST API, AES-256-GCM token encryption, AI-generated commit messages
2. **API Routes** - 15 endpoints: workspace CRUD, changes, commit, members, share links, CLI auth, join
3. **Share Links** - Create/manage links with permissions, expiry, max uses; join flow with auth redirect
4. **Review/Commit UI** - Diff viewer, commit modal with message input, grouped changes view
5. **Settings/Members** - Owner-only settings page, auto-commit config, member management with roles
6. **Change Indicators** - Sidebar shows modified/new file badges from uncommitted changes

## Moving Forward

### Immediate priorities
1. **Write tests** - Start with `@collab/shared` and `@collab/sync` unit tests, then API routes
2. **Fix pre-existing typecheck errors** - Clean up CLI, server presence, and Date type issues
3. **Manual end-to-end testing** - Test full flow: create workspace, edit doc, auto-commit, share link join

### Future features (from design doc)
- Conflict resolution UI with side-by-side merge
- CLI daemon with bidirectional file sync
- Workspace activity feed / audit log
- GitHub webhook integration for pull-from-remote sync
- Rate limiting middleware
- Role-based access control refinements
