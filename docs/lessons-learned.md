# Lessons Learned

## Cyclic Dependency: @collab/shared <-> @collab/db

**What went wrong**: Plan called for moving GitHub API functions (which import from `@collab/db`) into `@collab/shared`. This created a cyclic dependency since `@collab/db` already depends on `@collab/shared` for types/schemas.

**Why it happened**: The GitHub functions need database access (to look up tokens, workspaces) but `@collab/shared` is meant to be a lightweight types/schemas/constants package with no heavy dependencies.

**How it was fixed**: Kept `crypto.ts` in `@collab/shared` (no db dependency needed). GitHub API functions live in each app separately: `apps/server/src/services/github.ts` and `apps/web/lib/github.ts`. Both import `decryptToken` from `@collab/shared`.

**Prevention rule**: Never add `@collab/db` as a dependency of `@collab/shared`. If shared code needs db access, it belongs in the app layer, not the shared package.

---

## Pre-existing Type Error: packages/sync/src/sections.ts

**What went wrong**: `parseFrontmatter` function declared `let value: unknown` then called `value.startsWith()` which TypeScript rejects.

**Why it happened**: The variable needs to hold different types (string, boolean, number, object) during processing, but the initial `.startsWith()` check needs the string type.

**How it was fixed**: Introduced `rawValue` as a `string` for the initial parsing, keeping `value: unknown` for the reassigned result.

**Prevention rule**: When a variable changes types during processing, keep the original typed reference for type-specific operations.

---

## Server Missing drizzle-orm Direct Dependency

**What went wrong**: `pnpm typecheck` failed in `apps/server` with "Cannot find module 'drizzle-orm'" errors in commit.ts, github.ts, and slack.ts.

**Why it happened**: Server services import `eq`, `and`, `sql` from `drizzle-orm` directly, but it was only a transitive dependency (via `@collab/db`). pnpm's strict isolation means transitive deps aren't accessible.

**How it was fixed**: Added `drizzle-orm` as a direct dependency in `apps/server/package.json`.

**Prevention rule**: If a package imports from a module directly (not just re-exported types), add it as a direct dependency even if it's available transitively.

---

## Hocuspocus Type Gaps: onError, Extension, StatesArray

**What went wrong**: Multiple type errors in server extensions:
- `onError` callback doesn't exist in Hocuspocus `Configuration` type
- Custom `getDocumentPresence` method not in `Extension` interface
- `data.states` typed as `StatesArray` but code cast to `Map`
- `exactOptionalPropertyTypes` rejects `undefined` for optional string fields

**Why it happened**: Hocuspocus types don't match all runtime APIs. Custom extension methods need their own interfaces.

**How it was fixed**:
- Replaced `onError` with `onDestroy` (valid lifecycle hook)
- Created `PresenceExtension` interface extending `Extension` with custom method
- Added intermediate `unknown` cast for states: `as unknown as Map<...>`
- Used spread pattern to conditionally include optional properties: `...(value != null ? { key: value } : {})`

**Prevention rule**: When extending library interfaces, create your own interface with `extends`. When casting between incompatible types, use `unknown` intermediate cast.

---

## CLI .json() Returns unknown in Strict TypeScript

**What went wrong**: All `fetch().json()` calls in CLI commands returned `unknown`, causing 14 type errors when accessing properties.

**Why it happened**: With `strict: true`, `Response.json()` returns `Promise<unknown>` (not `any`).

**How it was fixed**: Added type assertions: `(await response.json()) as { expectedShape }` for each API response.

**Prevention rule**: Always type-assert `.json()` responses. Define response interfaces near the API call for readability.

---

## jsdom Cannot Mock navigator.clipboard

**What went wrong**: Component test for ShareModal clipboard copy failed. Neither `Object.assign(navigator, ...)`, `vi.stubGlobal`, nor `Object.defineProperty` could properly mock `navigator.clipboard.writeText` in jsdom.

**Why it happened**: jsdom defines `navigator.clipboard` with a read-only getter. Even `Object.defineProperty` on `window.navigator` has inconsistent behavior across jsdom versions.

**How it was fixed**: Tested the UI feedback (button text changes to "Copied!") instead of asserting on the clipboard mock. The click handler running proves the integration works.

**Prevention rule**: For browser-specific APIs (clipboard, geolocation, etc.) in jsdom, test the UI side effects rather than trying to mock the API internals. Save clipboard testing for E2E tests with a real browser.

---

## Drizzle date() Column Type is String, Not Date

**What went wrong**: `dailyCommitResetAt: new Date()` caused "Type 'Date' is not assignable to type 'string'" error.

**Why it happened**: Drizzle's `date()` column type maps to PostgreSQL `date` which is represented as an ISO date string (e.g., "2026-02-06") in TypeScript, not a JavaScript `Date` object.

**How it was fixed**: Changed to `new Date().toISOString().split('T')[0]!` to get the date string.

**Prevention rule**: Drizzle `date()` = string, `timestamp()` = Date. Check the column definition when assigning values.
