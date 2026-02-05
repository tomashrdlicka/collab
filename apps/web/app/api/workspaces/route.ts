import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import { workspaces, workspaceMembers } from '@collab/db/schema'
import { eq, or } from 'drizzle-orm'
import { createWorkspaceSchema } from '@collab/shared'
import { slugify } from '@/lib/utils'

export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
    )
  }

  const db = getDatabase()

  const userWorkspaces = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      slug: workspaces.slug,
      githubRepo: workspaces.githubRepo,
      githubBranch: workspaces.githubBranch,
      createdAt: workspaces.createdAt,
      updatedAt: workspaces.updatedAt,
    })
    .from(workspaces)
    .leftJoin(workspaceMembers, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(
      or(
        eq(workspaces.ownerId, session.user.id),
        eq(workspaceMembers.userId, session.user.id)
      )
    )

  return NextResponse.json({ data: userWorkspaces })
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)

  if (!session) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
    )
  }

  try {
    const body = await request.json()
    const parsed = createWorkspaceSchema.safeParse(body)

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

    const { name, githubRepo, githubBranch, basePath } = parsed.data
    const db = getDatabase()

    // Generate slug
    let slug = slugify(name)
    let suffix = 0

    // Check for existing slug
    while (true) {
      const existingSlug = slug + (suffix ? `-${suffix}` : '')
      const [existing] = await db
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(eq(workspaces.slug, existingSlug))
        .limit(1)

      if (!existing) {
        slug = existingSlug
        break
      }
      suffix++
    }

    // Create workspace
    const [workspace] = await db
      .insert(workspaces)
      .values({
        name,
        slug,
        githubRepo,
        githubBranch,
        basePath,
        ownerId: session.user.id,
      })
      .returning()

    if (!workspace) {
      throw new Error('Failed to create workspace')
    }

    // Add owner as member
    await db.insert(workspaceMembers).values({
      workspaceId: workspace.id,
      userId: session.user.id,
      role: 'owner',
    })

    return NextResponse.json({ data: workspace }, { status: 201 })
  } catch (error) {
    console.error('Failed to create workspace:', error)
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to create workspace' } },
      { status: 500 }
    )
  }
}
