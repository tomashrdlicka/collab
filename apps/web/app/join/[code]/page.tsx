'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { signIn, useSession } from 'next-auth/react'

interface JoinPageProps {
  params: { code: string }
}

interface ShareLinkInfo {
  workspaceName: string
  permission: string
  expired: boolean
  disabled: boolean
}

export default function JoinPage({ params }: JoinPageProps) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [linkInfo, setLinkInfo] = useState<ShareLinkInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isJoining, setIsJoining] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function checkLink() {
      try {
        // We'll use a simple GET to validate the link exists
        // The join endpoint itself will do full validation
        setIsLoading(false)
      } catch {
        setError('Failed to load share link')
        setIsLoading(false)
      }
    }

    checkLink()
  }, [params.code])

  async function handleJoin() {
    setIsJoining(true)
    setError(null)

    try {
      const response = await fetch(`/api/join/${params.code}`, {
        method: 'POST',
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error?.message ?? 'Failed to join workspace')
        return
      }

      if (data.data?.slug) {
        router.push(`/w/${data.data.slug}`)
      } else {
        router.push('/dashboard')
      }
    } catch {
      setError('Failed to join workspace')
    } finally {
      setIsJoining(false)
    }
  }

  if (isLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </main>
    )
  }

  if (status === 'loading') {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </main>
    )
  }

  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-sm p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold">Join Workspace</h1>
          <p className="text-muted-foreground mt-2">
            You've been invited to collaborate
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}

        {!session ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              Sign in with GitHub to join this workspace.
            </p>
            <button
              onClick={() => signIn('github', { callbackUrl: `/join/${params.code}` })}
              className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
            >
              <svg
                className="w-5 h-5"
                fill="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                  clipRule="evenodd"
                />
              </svg>
              Sign in with GitHub
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              Signed in as <span className="font-medium">@{session.user.githubUsername}</span>
            </p>
            <button
              onClick={handleJoin}
              disabled={isJoining}
              className="w-full px-4 py-3 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {isJoining ? 'Joining...' : 'Join Workspace'}
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
