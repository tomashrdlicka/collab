import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import { cliAuthCodes } from '@collab/db/schema'
import { eq } from 'drizzle-orm'

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)

  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  const url = new URL(request.url)
  const code = url.searchParams.get('code')

  if (!code) {
    return NextResponse.redirect(new URL('/dashboard?error=missing_code', request.url))
  }

  const db = getDatabase()

  const [authCode] = await db
    .select()
    .from(cliAuthCodes)
    .where(eq(cliAuthCodes.code, code))
    .limit(1)

  if (!authCode) {
    return NextResponse.redirect(new URL('/dashboard?error=invalid_code', request.url))
  }

  // Check if expired
  if (new Date() > authCode.expiresAt) {
    return NextResponse.redirect(new URL('/dashboard?error=expired_code', request.url))
  }

  // Check if already used
  if (authCode.userId) {
    return NextResponse.redirect(new URL('/dashboard?message=cli_already_confirmed', request.url))
  }

  // Set the userId
  await db
    .update(cliAuthCodes)
    .set({ userId: session.user.id })
    .where(eq(cliAuthCodes.id, authCode.id))

  return NextResponse.redirect(new URL('/dashboard?message=cli_auth_success', request.url))
}
