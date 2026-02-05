'use client'

import { useState } from 'react'
import { useWorkspace } from '@/app/w/[slug]/workspace-provider'

interface CommitModalProps {
  isOpen: boolean
  onClose: () => void
  uncommittedCount: number
  onCommitted: () => void
}

export function CommitModal({
  isOpen,
  onClose,
  uncommittedCount,
  onCommitted,
}: CommitModalProps) {
  const { workspace } = useWorkspace()
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [result, setResult] = useState<{ sha: string; url: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  async function handleCommit() {
    setStatus('loading')
    setError(null)

    try {
      const response = await fetch(`/api/workspaces/${workspace.id}/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: message.trim() || undefined,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error?.message ?? 'Failed to commit')
        setStatus('error')
        return
      }

      setResult({
        sha: data.data.sha,
        url: data.data.url,
      })
      setStatus('success')
      onCommitted()
    } catch {
      setError('Failed to commit to GitHub')
      setStatus('error')
    }
  }

  function handleClose() {
    setStatus('idle')
    setMessage('')
    setResult(null)
    setError(null)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative bg-background border rounded-lg shadow-lg w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Commit to GitHub</h2>
          <button
            onClick={handleClose}
            className="p-1 rounded hover:bg-accent transition-colors"
          >
            X
          </button>
        </div>

        {status === 'success' && result ? (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-green-500/10 text-green-600">
              <p className="font-medium">Committed successfully!</p>
              <p className="text-sm mt-1 font-mono">
                {result.sha.slice(0, 7)}
              </p>
            </div>
            <a
              href={result.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-center px-4 py-2 rounded-md border hover:bg-accent transition-colors text-sm"
            >
              View on GitHub
            </a>
            <button
              onClick={handleClose}
              className="w-full px-4 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity text-sm"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {uncommittedCount} uncommitted change{uncommittedCount > 1 ? 's' : ''} will be committed to{' '}
              <span className="font-mono text-foreground">{workspace.githubRepo}</span>
            </p>

            <div>
              <label className="block text-sm font-medium mb-1">
                Commit message (optional)
              </label>
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Auto-generated if empty"
                className="w-full px-3 py-2 border rounded-md text-sm bg-background"
                disabled={status === 'loading'}
              />
            </div>

            {error && (
              <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                {error}
              </div>
            )}

            <button
              onClick={handleCommit}
              disabled={status === 'loading'}
              className="w-full px-4 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 text-sm"
            >
              {status === 'loading' ? 'Committing...' : 'Commit to GitHub'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
