import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import {
  workspaces,
  workspaceMembers,
  documentChanges,
  documents,
} from '@collab/db/schema'
import { eq, and, sql } from 'drizzle-orm'
import { manualCommitSchema } from '@collab/shared'
import { commitToGitHub } from '@/lib/github'
import { getDocContent, decodeDocState } from '@collab/sync'

interface RouteParams {
  params: { id: string }
}

export async function POST(request: Request, { params }: RouteParams) {
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
        { error: { code: 'FORBIDDEN', message: 'Only owners and editors can commit' } },
        { status: 403 }
      )
    }
  }

  try {
    const body = await request.json()
    const parsed = manualCommitSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.errors[0]?.message ?? 'Invalid input',
          },
        },
        { status: 400 }
      )
    }

    // Get uncommitted changes
    const changes = await db
      .select()
      .from(documentChanges)
      .where(
        and(
          eq(documentChanges.workspaceId, params.id),
          eq(documentChanges.committed, false)
        )
      )

    if (changes.length === 0) {
      return NextResponse.json(
        { error: { code: 'NO_CHANGES', message: 'No uncommitted changes to commit' } },
        { status: 400 }
      )
    }

    // Get documents for the changes
    const docIds = [...new Set(changes.map((c) => c.documentId))]
    const docs = await db
      .select()
      .from(documents)
      .where(sql`${documents.id} = ANY(${docIds})`)

    // Build file contents
    const files: Array<{ path: string; content: string }> = []
    for (const doc of docs) {
      const content = getDocContent(decodeDocState(new Uint8Array(doc.yjsState)))
      files.push({ path: doc.path, content })
    }

    // Generate message
    const creates = changes.filter((c) => c.changeType === 'create').length
    const updates = changes.filter((c) => c.changeType === 'update').length
    const deletes = changes.filter((c) => c.changeType === 'delete').length

    const parts: string[] = []
    if (creates > 0) parts.push(`add ${creates} doc${creates > 1 ? 's' : ''}`)
    if (updates > 0) parts.push(`update ${updates} doc${updates > 1 ? 's' : ''}`)
    if (deletes > 0) parts.push(`remove ${deletes} doc${deletes > 1 ? 's' : ''}`)

    const message = parsed.data.message ?? `docs: ${parts.join(', ')}`

    // Commit to GitHub
    const result = await commitToGitHub(db, params.id, files, message)

    // Mark changes as committed
    await db
      .update(documentChanges)
      .set({
        committed: true,
        commitSha: result.sha,
      })
      .where(
        and(
          eq(documentChanges.workspaceId, params.id),
          eq(documentChanges.committed, false)
        )
      )

    // Update workspace
    await db
      .update(workspaces)
      .set({
        lastCommitAt: new Date(),
        lastCommitSha: result.sha,
        dailyCommitCount: sql`${workspaces.dailyCommitCount} + 1`,
      })
      .where(eq(workspaces.id, params.id))

    return NextResponse.json({
      data: {
        sha: result.sha,
        message,
        url: result.url,
      },
    })
  } catch (error) {
    console.error('Failed to commit:', error)
    return NextResponse.json(
      { error: { code: 'COMMIT_FAILED', message: 'Failed to commit to GitHub' } },
      { status: 500 }
    )
  }
}
