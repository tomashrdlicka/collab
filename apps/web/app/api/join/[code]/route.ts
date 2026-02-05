import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import { shareLinks, workspaces, workspaceMembers } from '@collab/db/schema'
import { eq, and, sql } from 'drizzle-orm'

interface RouteParams {
  params: { code: string }
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

  // Look up share link
  const [link] = await db
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.code, params.code))
    .limit(1)

  if (!link) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Invalid share link' } },
      { status: 404 }
    )
  }

  // Check if disabled
  if (link.disabledAt) {
    return NextResponse.json(
      { error: { code: 'DISABLED', message: 'This share link has been disabled' } },
      { status: 410 }
    )
  }

  // Check if expired
  if (link.expiresAt && new Date() > link.expiresAt) {
    return NextResponse.json(
      { error: { code: 'EXPIRED', message: 'This share link has expired' } },
      { status: 410 }
    )
  }

  // Check max uses
  if (link.maxUses && link.useCount >= link.maxUses) {
    return NextResponse.json(
      { error: { code: 'MAX_USES', message: 'This share link has reached its maximum uses' } },
      { status: 410 }
    )
  }

  // Check if already a member
  const [existingMember] = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, link.workspaceId),
        eq(workspaceMembers.userId, session.user.id)
      )
    )
    .limit(1)

  if (existingMember) {
    // Already a member, just return the workspace slug
    const [workspace] = await db
      .select({ slug: workspaces.slug })
      .from(workspaces)
      .where(eq(workspaces.id, link.workspaceId))
      .limit(1)

    return NextResponse.json({
      data: { slug: workspace?.slug, alreadyMember: true },
    })
  }

  // Add as member
  await db.insert(workspaceMembers).values({
    workspaceId: link.workspaceId,
    userId: session.user.id,
    role: link.permission,
  })

  // Increment use count
  await db
    .update(shareLinks)
    .set({ useCount: sql`${shareLinks.useCount} + 1` })
    .where(eq(shareLinks.id, link.id))

  // Get workspace slug for redirect
  const [workspace] = await db
    .select({ slug: workspaces.slug })
    .from(workspaces)
    .where(eq(workspaces.id, link.workspaceId))
    .limit(1)

  return NextResponse.json({
    data: { slug: workspace?.slug, alreadyMember: false },
  })
}
