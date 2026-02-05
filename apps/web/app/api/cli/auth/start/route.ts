import { NextResponse } from 'next/server'
import { getDatabase } from '@/lib/db'
import { cliAuthCodes } from '@collab/db/schema'
import { cliAuthStartSchema } from '@collab/shared'
import { generateShareCode } from '@/lib/utils'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const parsed = cliAuthStartSchema.safeParse(body)

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

    const db = getDatabase()
    const code = generateShareCode()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes

    await db.insert(cliAuthCodes).values({
      code,
      deviceName: parsed.data.deviceName ?? null,
      expiresAt,
    })

    const baseUrl = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'
    const authUrl = `${baseUrl}/login?cli_code=${code}`

    return NextResponse.json({
      data: {
        code,
        authUrl,
        expiresAt: expiresAt.toISOString(),
      },
    })
  } catch (error) {
    console.error('Failed to start CLI auth:', error)
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to start authentication' } },
      { status: 500 }
    )
  }
}
