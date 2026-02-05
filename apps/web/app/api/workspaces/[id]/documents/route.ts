import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import { documents, workspaces, workspaceMembers } from '@collab/db/schema'
import { eq, and, or } from 'drizzle-orm'

interface RouteParams {
  params: { id: string }
}

export async function GET(request: Request, { params }: RouteParams) {
  const session = await getServerSession(authOptions)

  if (!session) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
    )
  }

  const db = getDatabase()

  // Check workspace access
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

  // Check membership
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

    if (!membership) {
      return NextResponse.json(
        { error: { code: 'FORBIDDEN', message: 'Not a member of this workspace' } },
        { status: 403 }
      )
    }
  }

  // Get documents
  const workspaceDocuments = await db
    .select({
      id: documents.id,
      path: documents.path,
      contentHash: documents.contentHash,
      lastModifiedAt: documents.lastModifiedAt,
      createdAt: documents.createdAt,
    })
    .from(documents)
    .where(eq(documents.workspaceId, params.id))

  return NextResponse.json({ data: workspaceDocuments })
}
