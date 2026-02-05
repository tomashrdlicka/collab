import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import { workspaces, workspaceMembers, users } from '@collab/db/schema'
import { eq, and } from 'drizzle-orm'
import { addMemberSchema } from '@collab/shared'

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

  // Get members with user info
  const members = await db
    .select({
      userId: workspaceMembers.userId,
      role: workspaceMembers.role,
      joinedAt: workspaceMembers.createdAt,
      githubUsername: users.githubUsername,
      githubAvatarUrl: users.githubAvatarUrl,
    })
    .from(workspaceMembers)
    .innerJoin(users, eq(workspaceMembers.userId, users.id))
    .where(eq(workspaceMembers.workspaceId, params.id))

  return NextResponse.json({ data: members })
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

  // Only owner can add members
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
      { error: { code: 'FORBIDDEN', message: 'Only the owner can add members' } },
      { status: 403 }
    )
  }

  try {
    const body = await request.json()
    const parsed = addMemberSchema.safeParse(body)

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

    // Find user by GitHub username
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.githubUsername, parsed.data.githubUsername))
      .limit(1)

    if (!user) {
      return NextResponse.json(
        { error: { code: 'USER_NOT_FOUND', message: 'User not found. They must sign in first.' } },
        { status: 404 }
      )
    }

    // Check if already a member
    const [existing] = await db
      .select()
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, params.id),
          eq(workspaceMembers.userId, user.id)
        )
      )
      .limit(1)

    if (existing) {
      return NextResponse.json(
        { error: { code: 'ALREADY_MEMBER', message: 'User is already a member' } },
        { status: 409 }
      )
    }

    await db.insert(workspaceMembers).values({
      workspaceId: params.id,
      userId: user.id,
      role: parsed.data.role ?? 'editor',
    })

    return NextResponse.json(
      {
        data: {
          userId: user.id,
          githubUsername: user.githubUsername,
          role: parsed.data.role ?? 'editor',
        },
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Failed to add member:', error)
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to add member' } },
      { status: 500 }
    )
  }
}
