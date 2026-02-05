import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import { workspaces, workspaceMembers } from '@collab/db/schema'
import { eq, and } from 'drizzle-orm'
import { updateMemberSchema } from '@collab/shared'

interface RouteParams {
  params: { id: string; userId: string }
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const session = await getServerSession(authOptions)

  if (!session) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
    )
  }

  const db = getDatabase()

  // Only owner can update roles
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

  if (workspace.ownerId !== session.user.id) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Only the owner can update member roles' } },
      { status: 403 }
    )
  }

  // Cannot change owner's role
  if (params.userId === workspace.ownerId) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Cannot change the owner role' } },
      { status: 403 }
    )
  }

  try {
    const body = await request.json()
    const parsed = updateMemberSchema.safeParse(body)

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

    const [updated] = await db
      .update(workspaceMembers)
      .set({ role: parsed.data.role })
      .where(
        and(
          eq(workspaceMembers.workspaceId, params.id),
          eq(workspaceMembers.userId, params.userId)
        )
      )
      .returning()

    if (!updated) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Member not found' } },
        { status: 404 }
      )
    }

    return NextResponse.json({ data: updated })
  } catch (error) {
    console.error('Failed to update member:', error)
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to update member' } },
      { status: 500 }
    )
  }
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

  // Only owner can remove members
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

  if (workspace.ownerId !== session.user.id) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Only the owner can remove members' } },
      { status: 403 }
    )
  }

  // Cannot remove self (owner)
  if (params.userId === session.user.id) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Cannot remove yourself as owner' } },
      { status: 403 }
    )
  }

  await db
    .delete(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, params.id),
        eq(workspaceMembers.userId, params.userId)
      )
    )

  return NextResponse.json({ data: { success: true } })
}
