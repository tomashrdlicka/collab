import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import {
  workspaces,
  workspaceMembers,
  documents,
  documentChanges,
} from '@collab/db/schema'
import { eq, and } from 'drizzle-orm'
import { createCollabDoc, encodeDocState, computeContentHash } from '@collab/sync'
import { scanRepositoryMarkdownFiles, fetchFileContents } from '@/lib/github-read'
import type { ImportResult } from '@collab/shared'

interface RouteParams {
  params: { id: string }
}

export async function POST(_request: Request, { params }: RouteParams) {
  const session = await getServerSession(authOptions)

  if (!session) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
    )
  }

  const db = getDatabase()

  // Check workspace access (owner or editor)
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, params.id))
    .limit(1)

  if (!workspace) {
    return NextResponse.json(
      { error: { code: 'WORKSPACE_NOT_FOUND', message: 'Workspace not found' } },
      { status: 404 }
    )
  }

  const isOwner = workspace.ownerId === session.user.id
  if (!isOwner) {
    const [membership] = await db
      .select()
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, params.id),
          eq(workspaceMembers.userId, session.user.id)
        )
      )
      .limit(1)

    if (!membership || membership.role === 'viewer') {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Only owners and editors can import files' } },
        { status: 403 }
      )
    }
  }

  try {
    // Parse repo
    const [owner, repo] = workspace.githubRepo.split('/')
    if (!owner || !repo) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid repository format' } },
        { status: 400 }
      )
    }

    const branch = workspace.githubBranch
    const basePath = workspace.basePath

    // Scan repository for markdown files
    const { files: repoFiles, truncated } = await scanRepositoryMarkdownFiles(
      db,
      session.user.id,
      owner,
      repo,
      branch,
      basePath
    )

    // Query existing document paths for this workspace
    const existingDocs = await db
      .select({ path: documents.path })
      .from(documents)
      .where(eq(documents.workspaceId, params.id))

    const existingPaths = new Set(existingDocs.map((d) => d.path))

    // Filter to files not yet imported
    const newFiles = repoFiles.filter((f) => !existingPaths.has(f.path))

    if (newFiles.length === 0) {
      const result: ImportResult = {
        imported: 0,
        skipped: repoFiles.length,
        errors: 0,
        truncated,
        files: repoFiles.map((f) => ({
          path: f.path,
          status: 'skipped' as const,
          reason: 'Already exists',
        })),
      }
      return NextResponse.json({ data: result })
    }

    // Fetch content in batches
    const { results: fileContents, errors: fetchErrors } = await fetchFileContents(
      db,
      session.user.id,
      owner,
      repo,
      branch,
      newFiles
    )

    const importResult: ImportResult = {
      imported: 0,
      skipped: repoFiles.length - newFiles.length,
      errors: fetchErrors.length,
      truncated,
      files: [],
    }

    // Add skipped files to result
    for (const f of repoFiles) {
      if (existingPaths.has(f.path)) {
        importResult.files.push({ path: f.path, status: 'skipped', reason: 'Already exists' })
      }
    }

    // Add fetch errors to result
    for (const err of fetchErrors) {
      importResult.files.push({ path: err.path, status: 'error', reason: err.error })
    }

    // Import each file
    for (const file of fileContents) {
      try {
        // Create Yjs document with content
        const doc = createCollabDoc(file.content)
        const state = encodeDocState(doc)
        const hash = computeContentHash(file.content)

        // Insert document
        const [newDoc] = await db
          .insert(documents)
          .values({
            workspaceId: params.id,
            path: file.path,
            yjsState: Buffer.from(state),
            contentHash: hash,
            lastModifiedBy: session.user.id,
          })
          .returning({ id: documents.id })

        if (!newDoc) {
          throw new Error('Failed to insert document')
        }

        // Insert change record - committed: true since file already exists in GitHub
        await db.insert(documentChanges).values({
          documentId: newDoc.id,
          workspaceId: params.id,
          userId: session.user.id,
          userType: 'system',
          changeType: 'create',
          sectionsAffected: [],
          summary: `Imported from GitHub: ${file.path}`,
          committed: true,
        })

        importResult.imported++
        importResult.files.push({ path: file.path, status: 'imported' })
      } catch (error) {
        // Handle unique constraint violations (race condition) gracefully
        const message = error instanceof Error ? error.message : 'Unknown error'
        if (message.includes('unique') || message.includes('duplicate')) {
          importResult.skipped++
          importResult.files.push({ path: file.path, status: 'skipped', reason: 'Already exists (concurrent import)' })
        } else {
          importResult.errors++
          importResult.files.push({ path: file.path, status: 'error', reason: message })
        }
      }
    }

    return NextResponse.json({ data: importResult })
  } catch (error) {
    console.error('Failed to import:', error)
    return NextResponse.json(
      { error: { code: 'IMPORT_FAILED', message: 'Failed to import files from GitHub' } },
      { status: 500 }
    )
  }
}
