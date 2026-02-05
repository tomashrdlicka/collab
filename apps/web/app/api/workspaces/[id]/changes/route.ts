import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import { documentChanges, documents, users, workspaces, workspaceMembers } from '@collab/db/schema'
import { eq, and, desc } from 'drizzle-orm'

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

  const url = new URL(request.url)
  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 100)
  const offset = parseInt(url.searchParams.get('offset') ?? '0', 10)

  const changes = await db
    .select({
      id: documentChanges.id,
      documentId: documentChanges.documentId,
      userId: documentChanges.userId,
      userType: documentChanges.userType,
      agentName: documentChanges.agentName,
      changeType: documentChanges.changeType,
      sectionsAffected: documentChanges.sectionsAffected,
      summary: documentChanges.summary,
      diffPreview: documentChanges.diffPreview,
      committed: documentChanges.committed,
      commitSha: documentChanges.commitSha,
      createdAt: documentChanges.createdAt,
      documentPath: documents.path,
      userName: users.githubUsername,
      userAvatar: users.githubAvatarUrl,
    })
    .from(documentChanges)
    .leftJoin(documents, eq(documentChanges.documentId, documents.id))
    .leftJoin(users, eq(documentChanges.userId, users.id))
    .where(eq(documentChanges.workspaceId, params.id))
    .orderBy(desc(documentChanges.createdAt))
    .limit(limit)
    .offset(offset)

  return NextResponse.json({ data: changes })
}
