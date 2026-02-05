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
