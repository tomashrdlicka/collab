import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import { workspaces, shareLinks } from '@collab/db/schema'
import { eq, and } from 'drizzle-orm'

interface RouteParams {
  params: { id: string; linkId: string }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const session = await getServerSession(authOptions)

  if (!session) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
    )
  }

  const db = getDatabase()

  // Get the share link
  const [link] = await db
    .select()
    .from(shareLinks)
    .where(
      and(
        eq(shareLinks.id, params.linkId),
        eq(shareLinks.workspaceId, params.id)
      )
    )
    .limit(1)

  if (!link) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Share link not found' } },
      { status: 404 }
    )
  }

  // Check permission: creator or workspace owner
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, params.id))
    .limit(1)

  const isOwner = workspace?.ownerId === session.user.id
  const isCreator = link.createdBy === session.user.id

  if (!isOwner && !isCreator) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Only the creator or workspace owner can disable share links' } },
      { status: 403 }
    )
  }

  // Disable the link (soft delete)
  await db
    .update(shareLinks)
    .set({ disabledAt: new Date() })
    .where(eq(shareLinks.id, params.linkId))

  return NextResponse.json({ data: { success: true } })
}
