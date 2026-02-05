import type { NextAuthOptions } from 'next-auth'
import GithubProvider from 'next-auth/providers/github'
import { getDb } from '@collab/db'
import { users, githubTokens } from '@collab/db/schema'
import { eq } from 'drizzle-orm'
import { encryptToken } from '@collab/shared'

export const authOptions: NextAuthOptions = {
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'read:user user:email repo',
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (!account || account.provider !== 'github') {
        return false
      }

      const db = getDb()
      const githubId = String(account.providerAccountId)
      const githubProfile = profile as { login?: string; avatar_url?: string }

      // Check if user exists
      const [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.githubId, githubId))
        .limit(1)

      if (existingUser) {
        // Update user info
        await db
          .update(users)
          .set({
            githubUsername: githubProfile.login ?? existingUser.githubUsername,
            githubAvatarUrl: githubProfile.avatar_url ?? existingUser.githubAvatarUrl,
            email: user.email ?? existingUser.email,
            updatedAt: new Date(),
          })
          .where(eq(users.id, existingUser.id))

        // Update token
        if (account.access_token) {
          await db
            .update(githubTokens)
            .set({
              encryptedToken: encryptToken(account.access_token),
              tokenExpiresAt: account.expires_at
                ? new Date(account.expires_at * 1000)
                : null,
              updatedAt: new Date(),
            })
            .where(eq(githubTokens.userId, existingUser.id))
        }
      } else {
        // Create new user
        const [newUser] = await db
          .insert(users)
          .values({
            githubId,
            githubUsername: githubProfile.login ?? 'unknown',
            githubAvatarUrl: githubProfile.avatar_url ?? null,
            email: user.email ?? null,
          })
          .returning()

        if (newUser && account.access_token) {
          await db.insert(githubTokens).values({
            userId: newUser.id,
            encryptedToken: encryptToken(account.access_token),
            tokenExpiresAt: account.expires_at
              ? new Date(account.expires_at * 1000)
              : null,
          })
        }
      }

      return true
    },

    async jwt({ token, user, account }) {
      if (account && user) {
        const db = getDb()
        const githubId = String(account.providerAccountId)

        const [dbUser] = await db
          .select()
          .from(users)
          .where(eq(users.githubId, githubId))
          .limit(1)

        if (dbUser) {
          token.userId = dbUser.id
          token.githubUsername = dbUser.githubUsername
        }
      }

      return token
    },

    async session({ session, token }) {
      if (token.userId) {
        session.user.id = token.userId as string
        session.user.githubUsername = token.githubUsername as string
      }

      return session
    },
  },
  pages: {
    signIn: '/login',
  },
  session: {
    strategy: 'jwt',
  },
}

// Type augmentation for session
declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      name?: string | null
      email?: string | null
      image?: string | null
      githubUsername: string
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    userId?: string
    githubUsername?: string
  }
}
