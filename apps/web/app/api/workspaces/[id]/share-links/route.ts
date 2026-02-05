import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import { workspaces, workspaceMembers, shareLinks } from '@collab/db/schema'
import { eq, and } from 'drizzle-orm'
import { createShareLinkSchema } from '@collab/shared'
import { generateShareCode } from '@/lib/utils'

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
        { error: { code: 'FORBIDDEN', message: 'Only owners and editors can manage share links' } },
        { status: 403 }
      )
    }
  }

  const links = await db
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.workspaceId, params.id))

  return NextResponse.json({ data: links })
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
        { error: { code: 'FORBIDDEN', message: 'Only owners and editors can create share links' } },
        { status: 403 }
      )
    }
  }

  try {
    const body = await request.json()
    const parsed = createShareLinkSchema.safeParse(body)

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

    const code = generateShareCode()

    const [link] = await db
      .insert(shareLinks)
      .values({
        workspaceId: params.id,
        code,
        permission: parsed.data.permission ?? 'editor',
        requireGithub: parsed.data.requireGithub ?? true,
        expiresAt: parsed.data.expiresAt ?? null,
        maxUses: parsed.data.maxUses ?? null,
        createdBy: session.user.id,
      })
      .returning()

    return NextResponse.json({ data: link }, { status: 201 })
  } catch (error) {
    console.error('Failed to create share link:', error)
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to create share link' } },
      { status: 500 }
    )
  }
}
