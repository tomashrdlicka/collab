# Collab: Collaborative Markdown for AI Agents

## Problem

Developers using AI coding agents (Claude Code, Cursor, etc.) need a way to maintain shared documentation that:

1. **Syncs locally** - Agents edit files on disk, humans use their preferred editors
2. **Collaborates in real-time** - Multiple humans/agents editing simultaneously
3. **Persists to GitHub** - Version history without manual commit friction
4. **Reviews easily** - See what changed, by whom, approve before commit

**GitHub isn't right:** Committing is too heavy, no simultaneous editing, web UI for review isn't easy enough.

**Notion isn't right:** Hard to write locally and sync, editing experience more annoying than pure markdown.

## Solution

A real-time collaborative markdown platform optimized for AI agent workflows:

- **Web editor** with live cursors and presence
- **CLI daemon** that syncs local files bidirectionally
- **Auto-commits** to GitHub with AI-generated messages
- **Review UX** showing what changed since last commit
- **Share links** for quick collaboration
- **Slack notifications** for team awareness

## Target Audience

Developers in teams with deep coding backgrounds who:

- Use AI coding agents (Claude Code, Cursor, Copilot)
- Write specs, decisions, and documentation in markdown
- Want minimal friction between local editing and collaboration
- Value keyboard shortcuts, clean UI, fast performance
- Don't need hand-holding - prefer power-user features

## Architecture

```
                                 ┌─────────────────────────────────────────────────────┐
                                 │                   Sync Server                       │
                                 │                                                     │
                                 │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
                                 │  │ Hocuspocus  │  │  Postgres   │  │    Redis    │ │
                                 │  │ (Yjs sync)  │  │  (storage)  │  │ (presence)  │ │
                                 │  └──────┬──────┘  └──────┬──────┘  └─────────────┘ │
                                 │         │                │                         │
                                 │  ┌──────┴────────────────┴──────┐                  │
                                 │  │      Document Manager        │                  │
                                 │  │   (Yjs persistence + sync)   │                  │
                                 │  └──────────────┬───────────────┘                  │
                                 │                 │                                  │
                                 │  ┌──────────────┴───────────────┐                  │
                                 │  │       GitHub Committer       │                  │
                                 │  │  (batched, AI messages)      │                  │
                                 │  └──────────────┬───────────────┘                  │
                                 │                 │                                  │
                                 │  ┌──────────────┴───────────────┐                  │
                                 │  │      Slack Notifier          │                  │
                                 │  │   (webhook integration)      │                  │
                                 │  └──────────────────────────────┘                  │
                                 └───────────────────┬─────────────────────────────────┘
                                                     │
                          ┌──────────────────────────┼──────────────────────────┐
                          │                          │                          │
                   ┌──────┴──────┐           ┌───────┴──────┐           ┌───────┴──────┐
                   │ CLI Daemon  │           │  Web Editor  │           │  Web Editor  │
                   │  (macOS)    │           │  (Human 1)   │           │  (Human 2)   │
                   └──────┬──────┘           └──────────────┘           └──────────────┘
                          │
                   ┌──────┴──────┐
                   │ Local Files │
                   │ (Claude/VS) │
                   └─────────────┘
```

## Tech Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Web App | Next.js 14 (App Router) | Fast, full-stack, great DX |
| Editor | CodeMirror 6 | Best markdown editor, Yjs binding exists |
| Real-time | Yjs + Hocuspocus | Battle-tested CRDT, handles conflicts |
| Database | PostgreSQL | Reliable, JSON support for Yjs state |
| Cache | Redis | Presence data, rate limiting |
| Auth | NextAuth.js + GitHub OAuth | Simple, GitHub-native |
| CLI | Node.js + Commander | Fast to build, shares code with server |
| Styling | Tailwind CSS | Utility-first, fast iteration |
| Monorepo | Turborepo + pnpm | Fast builds, shared packages |

## Data Model

### PostgreSQL Schema

```sql
-- Users (GitHub-authenticated)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  github_id TEXT UNIQUE NOT NULL,
  github_username TEXT NOT NULL,
  github_avatar_url TEXT,
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- GitHub tokens (encrypted, separate for security)
CREATE TABLE github_tokens (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  encrypted_token BYTEA NOT NULL,
  token_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Workspaces (linked to GitHub repos)
CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  github_repo TEXT NOT NULL,              -- "owner/repo"
  github_branch TEXT DEFAULT 'main',
  base_path TEXT DEFAULT '/',             -- Subdirectory in repo
  owner_id UUID NOT NULL REFERENCES users(id),

  -- Commit settings
  auto_commit_enabled BOOLEAN DEFAULT true,
  auto_commit_idle_minutes INT DEFAULT 5,
  auto_commit_max_minutes INT DEFAULT 60,
  daily_commit_count INT DEFAULT 0,
  daily_commit_reset_at DATE DEFAULT CURRENT_DATE,

  -- Last commit info
  last_commit_at TIMESTAMPTZ,
  last_commit_sha TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Workspace members
CREATE TABLE workspace_members (
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (workspace_id, user_id)
);

-- Share links
CREATE TABLE share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  code TEXT UNIQUE NOT NULL,              -- Short URL code (e.g., "x7k9m2")
  permission TEXT NOT NULL CHECK (permission IN ('viewer', 'editor')),
  require_github BOOLEAN DEFAULT true,
  expires_at TIMESTAMPTZ,                 -- NULL = never expires
  max_uses INT,                           -- NULL = unlimited
  use_count INT DEFAULT 0,
  created_by UUID NOT NULL REFERENCES users(id),
  disabled_at TIMESTAMPTZ,                -- NULL = active
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Documents (Yjs state persistence)
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  path TEXT NOT NULL,                     -- Relative path: "specs/auth.md"
  yjs_state BYTEA NOT NULL,               -- Serialized Yjs document
  content_hash TEXT,                      -- For change detection
  last_modified_by UUID REFERENCES users(id),
  last_modified_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (workspace_id, path)
);

-- Document changes (for review UX)
CREATE TABLE document_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),      -- NULL for system changes
  user_type TEXT NOT NULL CHECK (user_type IN ('human', 'agent', 'system')),
  agent_name TEXT,                        -- "claude-code", "cursor", etc.
  change_type TEXT NOT NULL CHECK (change_type IN ('create', 'update', 'delete')),
  sections_affected TEXT[],               -- ["Overview", "API Contract"]
  summary TEXT,                           -- AI-generated summary
  diff_preview TEXT,                      -- First 500 chars of diff
  committed BOOLEAN DEFAULT false,
  commit_sha TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Conflicts (line-level)
CREATE TABLE conflicts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  line_number INT NOT NULL,
  versions JSONB NOT NULL,                -- [{ user_id, user_type, content, timestamp }]
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES users(id),
  resolution TEXT,                        -- The chosen content
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Workspace integrations (Slack, etc.)
CREATE TABLE workspace_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('slack')),
  config JSONB NOT NULL,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (workspace_id, type)
);

-- Indexes
CREATE INDEX idx_workspace_members_user ON workspace_members(user_id);
CREATE INDEX idx_documents_workspace ON documents(workspace_id);
CREATE INDEX idx_document_changes_workspace ON document_changes(workspace_id, created_at DESC);
CREATE INDEX idx_document_changes_uncommitted ON document_changes(workspace_id) WHERE NOT committed;
CREATE INDEX idx_share_links_code ON share_links(code) WHERE disabled_at IS NULL;
CREATE INDEX idx_conflicts_unresolved ON conflicts(document_id) WHERE resolved_at IS NULL;
```

### Yjs Document Structure

```typescript
// Each document is a Yjs Doc
interface CollabDocument {
  // Main content as Yjs Text (enables character-level collaboration)
  content: Y.Text

  // Awareness (presence) - not persisted, runtime only
  awareness: {
    user: {
      id: string
      name: string
      color: string      // Cursor color
      type: 'human' | 'agent'
      agentName?: string // "claude-code"
    }
    cursor: {
      anchor: number     // Selection start
      head: number       // Selection end (cursor position)
    } | null
  }
}
```

## API Contracts

### REST API (Next.js API Routes)

```typescript
// Authentication
POST /api/auth/github          // GitHub OAuth callback
GET  /api/auth/session         // Current session
POST /api/auth/logout          // Logout

// Workspaces
GET    /api/workspaces                    // List user's workspaces
POST   /api/workspaces                    // Create workspace
GET    /api/workspaces/:id                // Get workspace details
PATCH  /api/workspaces/:id                // Update workspace settings
DELETE /api/workspaces/:id                // Delete workspace

// Workspace members
GET    /api/workspaces/:id/members        // List members
POST   /api/workspaces/:id/members        // Add member
PATCH  /api/workspaces/:id/members/:uid   // Update member role
DELETE /api/workspaces/:id/members/:uid   // Remove member

// Share links
GET    /api/workspaces/:id/share-links    // List share links
POST   /api/workspaces/:id/share-links    // Create share link
DELETE /api/share-links/:code             // Disable share link
GET    /api/join/:code                    // Get share link info (public)
POST   /api/join/:code                    // Join via share link

// Documents
GET    /api/workspaces/:id/documents      // List documents in workspace
GET    /api/workspaces/:id/documents/:path // Get document metadata
DELETE /api/workspaces/:id/documents/:path // Delete document

// Changes (review UX)
GET    /api/workspaces/:id/changes        // List recent changes
GET    /api/workspaces/:id/changes/uncommitted // Uncommitted changes

// Commits
POST   /api/workspaces/:id/commit         // Trigger manual commit
GET    /api/workspaces/:id/commits        // List recent commits

// Integrations
GET    /api/workspaces/:id/integrations   // List integrations
PUT    /api/workspaces/:id/integrations/slack // Configure Slack

// CLI authentication
POST   /api/cli/auth/start                // Start CLI auth flow
GET    /api/cli/auth/poll/:code           // Poll for auth completion
```

### WebSocket Protocol (Hocuspocus)

```typescript
// Connection URL
ws://server/collab/:workspaceId/:documentPath

// Authentication via query params or headers
?token=<session-token>

// Yjs sync messages handled by Hocuspocus automatically

// Custom messages for presence and conflicts
interface PresenceUpdate {
  type: 'presence'
  users: Array<{
    id: string
    name: string
    color: string
    type: 'human' | 'agent'
    cursor: { anchor: number; head: number } | null
  }>
}

interface ConflictDetected {
  type: 'conflict'
  documentPath: string
  lineNumber: number
  versions: Array<{
    userId: string
    userName: string
    content: string
    timestamp: number
  }>
}

interface ConflictResolved {
  type: 'conflict_resolved'
  documentPath: string
  lineNumber: number
  resolution: string
  resolvedBy: string
}
```

### CLI Commands

```bash
# Authentication
collab login                   # Open browser for GitHub OAuth
collab logout                  # Remove stored credentials
collab whoami                  # Show current user

# Workspace management
collab init                    # Link current directory to workspace (interactive)
collab init --workspace <id>   # Link to specific workspace
collab status                  # Show sync status, conflicts, uncommitted changes

# Sync
collab watch                   # Start file watcher (foreground)
collab watch --daemon          # Start as background process
collab stop                    # Stop background daemon

# Manual operations
collab commit                  # Force commit now (with AI message)
collab commit -m "message"     # Force commit with custom message
collab pull                    # Pull latest from server
collab push                    # Push local changes to server

# Utilities
collab open                    # Open workspace in browser
collab conflicts               # List unresolved conflicts
```

## Core Flows

### 1. GitHub OAuth Flow

```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│  User   │     │   Web   │     │ Server  │     │ GitHub  │
└────┬────┘     └────┬────┘     └────┬────┘     └────┬────┘
     │               │               │               │
     │ Click login   │               │               │
     │──────────────>│               │               │
     │               │               │               │
     │               │ Redirect      │               │
     │<──────────────│──────────────>│               │
     │               │               │               │
     │ Auth on GitHub│               │               │
     │───────────────────────────────────────────────>
     │               │               │               │
     │               │ Callback      │               │
     │               │<──────────────────────────────│
     │               │               │               │
     │               │ Exchange code │               │
     │               │──────────────>│               │
     │               │               │ Get token     │
     │               │               │──────────────>│
     │               │               │<──────────────│
     │               │               │               │
     │               │ Session       │               │
     │<──────────────│<──────────────│               │
     │               │               │               │
```

### 2. Real-time Collaboration Flow

```
┌─────────┐     ┌─────────┐     ┌───────────┐     ┌─────────┐
│ User A  │     │ Server  │     │ Postgres  │     │ User B  │
└────┬────┘     └────┬────┘     └─────┬─────┘     └────┬────┘
     │               │                │                │
     │ Connect WS    │                │                │
     │──────────────>│                │                │
     │               │ Load Yjs      │                │
     │               │───────────────>│                │
     │               │<───────────────│                │
     │ Sync state    │                │                │
     │<──────────────│                │                │
     │               │                │                │
     │ Type "Hello"  │                │                │
     │──────────────>│                │                │
     │               │ Broadcast      │                │
     │               │────────────────────────────────>│
     │               │                │                │
     │               │                │    Type "Hi"   │
     │               │<────────────────────────────────│
     │ Receive "Hi"  │                │                │
     │<──────────────│                │                │
     │               │                │                │
     │               │ Persist (debounced)             │
     │               │───────────────>│                │
     │               │                │                │
```

### 3. Auto-Commit Flow

```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│ Editors │     │ Server  │     │ Claude  │     │ GitHub  │
└────┬────┘     └────┬────┘     └────┬────┘     └────┬────┘
     │               │               │               │
     │ Edits...      │               │               │
     │──────────────>│               │               │
     │               │               │               │
     │ (5 min idle)  │               │               │
     │               │               │               │
     │               │ Collect diffs │               │
     │               │───────┐       │               │
     │               │<──────┘       │               │
     │               │               │               │
     │               │ Generate msg  │               │
     │               │──────────────>│               │
     │               │<──────────────│               │
     │               │               │               │
     │               │ Commit        │               │
     │               │──────────────────────────────>│
     │               │<──────────────────────────────│
     │               │               │               │
     │ Notify        │               │               │
     │<──────────────│               │               │
     │               │               │               │
     │               │ Slack webhook │               │
     │               │───────────────────────┐       │
     │               │<──────────────────────┘       │
     │               │               │               │
```

### 4. CLI Sync Flow

```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│  Files  │     │   CLI   │     │ Server  │     │  Web    │
└────┬────┘     └────┬────┘     └────┬────┘     └────┬────┘
     │               │               │               │
     │ File changed  │               │               │
     │──────────────>│               │               │
     │               │               │               │
     │               │ Debounce      │               │
     │               │───────┐       │               │
     │               │<──────┘       │               │
     │               │               │               │
     │               │ Read file     │               │
     │<──────────────│               │               │
     │──────────────>│               │               │
     │               │               │               │
     │               │ Yjs update    │               │
     │               │──────────────>│               │
     │               │               │               │
     │               │               │ Broadcast     │
     │               │               │──────────────>│
     │               │               │               │
     │               │ Remote update │               │
     │               │<──────────────│               │
     │               │               │               │
     │ Write file    │               │               │
     │<──────────────│               │               │
     │               │               │               │
```

### 5. Conflict Detection & Resolution

```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│ User A  │     │ Server  │     │ User B  │     │  Web    │
└────┬────┘     └────┬────┘     └────┬────┘     └────┬────┘
     │               │               │               │
     │ Edit line 5   │               │               │
     │──────────────>│               │               │
     │               │               │               │
     │               │   Edit line 5 │               │
     │               │<──────────────│               │
     │               │               │               │
     │               │ Conflict!     │               │
     │               │───────┐       │               │
     │               │<──────┘       │               │
     │               │               │               │
     │ Conflict msg  │               │ Conflict msg  │
     │<──────────────│──────────────>│               │
     │               │               │               │
     │               │               │ Open resolver │
     │               │               │──────────────>│
     │               │               │               │
     │               │               │ Pick version  │
     │               │<────────────────────────────── │
     │               │               │               │
     │ Resolution    │               │ Resolution    │
     │<──────────────│──────────────>│               │
     │               │               │               │
```

## Component Details

### Web App Structure

```
apps/web/
├── app/
│   ├── layout.tsx              # Root layout with providers
│   ├── page.tsx                # Landing/dashboard
│   ├── (auth)/
│   │   ├── login/page.tsx      # Login page
│   │   └── callback/page.tsx   # OAuth callback
│   ├── (dashboard)/
│   │   ├── layout.tsx          # Dashboard layout
│   │   ├── page.tsx            # Workspace list
│   │   └── new/page.tsx        # Create workspace
│   ├── w/[slug]/
│   │   ├── layout.tsx          # Workspace layout (sidebar)
│   │   ├── page.tsx            # Workspace home (changes view)
│   │   ├── [...path]/page.tsx  # Document editor
│   │   └── settings/page.tsx   # Workspace settings
│   ├── join/[code]/page.tsx    # Join via share link
│   └── api/
│       ├── auth/[...nextauth]/route.ts
│       ├── workspaces/
│       ├── cli/
│       └── ...
├── components/
│   ├── editor/
│   │   ├── CollabEditor.tsx    # Main CodeMirror editor
│   │   ├── Toolbar.tsx         # Formatting toolbar
│   │   ├── Presence.tsx        # Cursor/user indicators
│   │   └── ConflictModal.tsx   # Conflict resolution UI
│   ├── sidebar/
│   │   ├── FileTree.tsx        # File navigation
│   │   ├── ActivityFeed.tsx    # Recent changes
│   │   └── Collaborators.tsx   # Online users
│   ├── review/
│   │   ├── ChangesList.tsx     # Changes since commit
│   │   ├── DiffView.tsx        # Side-by-side diff
│   │   └── CommitModal.tsx     # Commit with AI message
│   ├── share/
│   │   ├── ShareModal.tsx      # Share settings
│   │   └── InviteForm.tsx      # Add collaborator
│   └── ui/                     # Reusable components
├── lib/
│   ├── auth.ts                 # NextAuth config
│   ├── db.ts                   # Database client
│   ├── yjs.ts                  # Yjs utilities
│   └── github.ts               # GitHub API client
└── hooks/
    ├── useCollab.ts            # Collaboration hook
    ├── usePresence.ts          # Presence hook
    └── useWorkspace.ts         # Workspace data hook
```

### Sync Server Structure

```
apps/server/
├── src/
│   ├── index.ts                # Entry point
│   ├── hocuspocus.ts           # Hocuspocus server config
│   ├── extensions/
│   │   ├── auth.ts             # Authentication extension
│   │   ├── persistence.ts      # Postgres persistence
│   │   ├── presence.ts         # Custom presence tracking
│   │   └── conflicts.ts        # Conflict detection
│   ├── services/
│   │   ├── github.ts           # GitHub API + committer
│   │   ├── ai.ts               # Claude API for messages
│   │   ├── slack.ts            # Slack webhook
│   │   └── changes.ts          # Change tracking
│   └── utils/
│       ├── crypto.ts           # Token encryption
│       └── diff.ts             # Diff generation
├── Dockerfile
└── package.json
```

### CLI Structure

```
apps/cli/
├── src/
│   ├── index.ts                # Entry point
│   ├── commands/
│   │   ├── login.ts            # GitHub auth
│   │   ├── logout.ts           # Clear credentials
│   │   ├── init.ts             # Link directory
│   │   ├── watch.ts            # Start sync
│   │   ├── status.ts           # Show status
│   │   ├── commit.ts           # Manual commit
│   │   └── open.ts             # Open browser
│   ├── sync/
│   │   ├── watcher.ts          # File watcher (Chokidar)
│   │   ├── client.ts           # WebSocket client
│   │   └── reconciler.ts       # Local/remote sync logic
│   ├── auth/
│   │   ├── keychain.ts         # macOS Keychain
│   │   └── browser.ts          # Open browser for OAuth
│   └── config/
│       ├── store.ts            # Config file management
│       └── workspace.ts        # .collab config
├── bin/
│   └── collab                  # CLI entry
└── package.json
```

### Shared Packages

```
packages/
├── shared/
│   ├── src/
│   │   ├── types.ts            # Shared TypeScript types
│   │   ├── constants.ts        # Shared constants
│   │   └── validation.ts       # Zod schemas
│   └── package.json
├── sync/
│   ├── src/
│   │   ├── document.ts         # Yjs document helpers
│   │   ├── awareness.ts        # Presence/awareness
│   │   └── merge.ts            # Merge utilities
│   └── package.json
└── db/
    ├── src/
    │   ├── schema.ts           # Drizzle schema
    │   ├── client.ts           # Database client
    │   └── migrations/         # SQL migrations
    └── package.json
```

## UI Design Principles

For developers with deep coding backgrounds:

1. **Keyboard-first** - All actions have shortcuts, modal navigation with j/k
2. **Information dense** - No excessive whitespace, compact file tree
3. **Fast feedback** - Instant sync indicators, no loading spinners for <100ms
4. **Monospace by default** - Code-like editor, syntax highlighting
5. **Dark mode** - System preference, toggleable
6. **No onboarding modals** - Inline hints only when stuck
7. **Command palette** - Cmd+K for quick actions

### Key Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+K` | Command palette |
| `Cmd+S` | Manual save (triggers sync) |
| `Cmd+Shift+C` | Commit now |
| `Cmd+B` | Toggle sidebar |
| `Cmd+P` | Quick file open |
| `Cmd+/` | Toggle comment |
| `Cmd+Shift+P` | Preview markdown |
| `Esc` | Close modal/panel |
| `j/k` | Navigate lists |
| `Enter` | Select/open |

## Security Considerations

1. **Token encryption** - GitHub tokens encrypted at rest with AES-256
2. **Workspace isolation** - All queries scoped by workspace membership
3. **Share link limits** - Optional expiration, max uses, require GitHub auth
4. **Rate limiting** - Per-user and per-workspace limits on API
5. **Input validation** - Zod schemas for all inputs
6. **XSS prevention** - Markdown sanitized before render
7. **CSRF protection** - SameSite cookies, CSRF tokens for mutations

## Performance Targets

| Metric | Target |
|--------|--------|
| Initial load (web) | <2s |
| Sync latency | <100ms |
| File watcher debounce | 300ms |
| Commit queue | 5min idle or 60min max |
| Reconnection | <5s |
| Offline queue size | 1000 operations |

## Testing Strategy

### Unit Tests

- Yjs document operations
- Diff generation
- Conflict detection logic
- API validation

### Integration Tests

- WebSocket connection/reconnection
- GitHub OAuth flow
- Commit generation
- Slack webhook delivery

### E2E Tests

- Full collaboration flow (2+ users)
- CLI sync with web editor
- Offline/reconnection
- Share link join flow

## Deployment

### Infrastructure (MVP)

- **Vercel** - Web app (auto-scaling, edge)
- **Railway** - Sync server + Postgres + Redis
- **Anthropic API** - Claude for commit messages

### Environment Variables

```bash
# Web App
NEXTAUTH_URL=https://collab.dev
NEXTAUTH_SECRET=<random>
GITHUB_CLIENT_ID=<from github>
GITHUB_CLIENT_SECRET=<from github>
DATABASE_URL=<postgres url>
HOCUSPOCUS_URL=wss://sync.collab.dev

# Sync Server
DATABASE_URL=<postgres url>
REDIS_URL=<redis url>
ENCRYPTION_KEY=<32 byte key>
ANTHROPIC_API_KEY=<claude api key>

# CLI
API_URL=https://collab.dev/api
WS_URL=wss://sync.collab.dev
```

## Migration Plan

### From GitHub-only workflow

1. Create workspace linked to existing repo
2. Initial sync pulls all .md files
3. Continue using GitHub for PRs, issues
4. Collab handles real-time editing + auto-commits

### From Notion

1. Export Notion pages as markdown
2. Add to repo, create workspace
3. Collab preserves plain markdown format

## Open Questions (Resolved)

| Question | Decision |
|----------|----------|
| Conflict granularity | Line-level |
| Token storage (CLI) | macOS Keychain |
| Platform priority | Mac-first |
| Doc persistence | Postgres (not rebuilt from GitHub) |
| Commit batching | 5 min idle, 60 min max |
| Offline support | Yes (web), No (CLI) |

## Success Metrics

1. **Adoption** - Teams using Collab for >50% of doc edits
2. **Sync reliability** - <0.1% sync failures
3. **Collaboration** - Avg 2+ simultaneous editors
4. **Agent usage** - >30% of edits from AI agents
5. **Commit quality** - AI messages rated useful by users

---

## Implementation Order

1. **Monorepo setup** - Turborepo, pnpm, base configs
2. **Database** - Schema, migrations, Drizzle setup
3. **Auth** - NextAuth with GitHub OAuth
4. **Sync server** - Hocuspocus with Postgres persistence
5. **Web editor** - CodeMirror with Yjs binding
6. **Changes view** - Review UX for uncommitted changes
7. **Share flow** - Links, permissions, join flow
8. **CLI daemon** - File watcher, sync client
9. **GitHub committer** - Batched commits with AI messages
10. **Slack integration** - Webhook notifications
11. **Offline support** - IndexedDB, service worker
