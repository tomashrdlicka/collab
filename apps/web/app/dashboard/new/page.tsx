'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function NewWorkspacePage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [githubRepo, setGithubRepo] = useState('')
  const [githubBranch, setGithubBranch] = useState('main')
  const [basePath, setBasePath] = useState('/')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          githubRepo,
          githubBranch,
          basePath,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error?.message ?? 'Failed to create workspace')
      }

      router.push(`/w/${data.data.slug}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 h-16 flex items-center">
          <Link href="/dashboard" className="text-xl font-semibold">
            Collab
          </Link>
        </div>
      </header>

      {/* Content */}
      <div className="container mx-auto px-4 py-8 max-w-lg">
        <h1 className="text-2xl font-bold mb-8">Create Workspace</h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="name" className="block text-sm font-medium mb-2">
              Workspace Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Documentation"
              required
              className="w-full px-3 py-2 border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <div>
            <label htmlFor="repo" className="block text-sm font-medium mb-2">
              GitHub Repository
            </label>
            <input
              id="repo"
              type="text"
              value={githubRepo}
              onChange={(e) => setGithubRepo(e.target.value)}
              placeholder="owner/repository"
              required
              pattern="[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+"
              className="w-full px-3 py-2 border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary font-mono text-sm"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Format: owner/repository (e.g., pydantic/pydantic-ai)
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="branch" className="block text-sm font-medium mb-2">
                Branch
              </label>
              <input
                id="branch"
                type="text"
                value={githubBranch}
                onChange={(e) => setGithubBranch(e.target.value)}
                placeholder="main"
                className="w-full px-3 py-2 border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary font-mono text-sm"
              />
            </div>

            <div>
              <label htmlFor="path" className="block text-sm font-medium mb-2">
                Base Path
              </label>
              <input
                id="path"
                type="text"
                value={basePath}
                onChange={(e) => setBasePath(e.target.value)}
                placeholder="/"
                className="w-full px-3 py-2 border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-primary font-mono text-sm"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                e.g., /docs or /
              </p>
            </div>
          </div>

          <div className="flex gap-4 pt-4">
            <Link
              href="/dashboard"
              className="flex-1 px-4 py-2 text-center border rounded-md hover:bg-accent transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 px-4 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {isLoading ? 'Creating...' : 'Create Workspace'}
            </button>
          </div>
        </form>
      </div>
    </main>
  )
}
