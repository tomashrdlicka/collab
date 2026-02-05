import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/db'
import { cliAuthCodes, users } from '@collab/db/schema'
import { eq } from 'drizzle-orm'

interface RouteParams {
  params: { code: string }
}

export async function GET(request: Request, { params }: RouteParams) {
  const db = getDatabase()

  const [authCode] = await db
    .select()
    .from(cliAuthCodes)
    .where(eq(cliAuthCodes.code, params.code))
    .limit(1)

  if (!authCode) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Auth code not found' } },
      { status: 404 }
    )
  }

  // Check if expired
  if (new Date() > authCode.expiresAt) {
    return NextResponse.json(
      { error: { code: 'EXPIRED', message: 'Auth code has expired' } },
      { status: 410 }
    )
  }

  // Check if user has confirmed
  if (!authCode.userId) {
    return NextResponse.json({ data: { status: 'pending' } })
  }

  // Get user info
  const [user] = await db
    .select({
      id: users.id,
      githubUsername: users.githubUsername,
    })
    .from(users)
    .where(eq(users.id, authCode.userId))
    .limit(1)

  if (!user) {
    return NextResponse.json({ data: { status: 'pending' } })
  }

  // Mark as used
  if (!authCode.usedAt) {
    await db
      .update(cliAuthCodes)
      .set({ usedAt: new Date() })
      .where(eq(cliAuthCodes.id, authCode.id))
  }

  return NextResponse.json({
    data: {
      status: 'completed',
      userId: user.id,
      username: user.githubUsername,
    },
  })
}
