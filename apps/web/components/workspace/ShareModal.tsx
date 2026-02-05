'use client'

import { useState, useEffect } from 'react'
import { useWorkspace } from '@/app/w/[slug]/workspace-provider'
import { formatRelativeTime } from '@/lib/utils'

interface ShareLink {
  id: string
  code: string
  permission: string
  expiresAt: string | null
  maxUses: number | null
  useCount: number
  disabledAt: string | null
  createdAt: string
}

interface ShareModalProps {
  isOpen: boolean
  onClose: () => void
}

export function ShareModal({ isOpen, onClose }: ShareModalProps) {
  const { workspace } = useWorkspace()
  const [links, setLinks] = useState<ShareLink[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [permission, setPermission] = useState<'viewer' | 'editor'>('editor')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      fetchLinks()
    }
  }, [isOpen])

  async function fetchLinks() {
    setIsLoading(true)
    try {
      const response = await fetch(`/api/workspaces/${workspace.id}/share-links`)
      if (response.ok) {
        const data = await response.json()
        setLinks(data.data ?? [])
      }
    } catch (error) {
      console.error('Failed to fetch share links:', error)
    } finally {
      setIsLoading(false)
    }
  }

  async function createLink() {
    setIsCreating(true)
    try {
      const response = await fetch(`/api/workspaces/${workspace.id}/share-links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permission }),
      })

      if (response.ok) {
        await fetchLinks()
      }
    } catch (error) {
      console.error('Failed to create share link:', error)
    } finally {
      setIsCreating(false)
    }
  }

  async function disableLink(linkId: string) {
    try {
      await fetch(`/api/workspaces/${workspace.id}/share-links/${linkId}`, {
        method: 'DELETE',
      })
      await fetchLinks()
    } catch (error) {
      console.error('Failed to disable share link:', error)
    }
  }

  function copyLink(code: string, linkId: string) {
    const url = `${window.location.origin}/join/${code}`
    navigator.clipboard.writeText(url)
    setCopiedId(linkId)
    setTimeout(() => setCopiedId(null), 2000)
  }

  if (!isOpen) return null

  const activeLinks = links.filter((l) => !l.disabledAt)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-background border rounded-lg shadow-lg w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Share Workspace</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-accent transition-colors"
          >
            X
          </button>
        </div>

        {/* Create new link */}
        <div className="mb-6 p-4 border rounded-lg">
          <div className="flex items-center gap-3 mb-3">
            <label className="text-sm font-medium">Permission:</label>
            <select
              value={permission}
              onChange={(e) => setPermission(e.target.value as 'viewer' | 'editor')}
              className="text-sm px-2 py-1 border rounded bg-background"
            >
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>
          <button
            onClick={createLink}
            disabled={isCreating}
            className="w-full px-3 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 text-sm"
          >
            {isCreating ? 'Creating...' : 'Create Share Link'}
          </button>
        </div>

        {/* Existing links */}
        <div>
          <h3 className="text-sm font-medium mb-2">
            Active Links ({activeLinks.length})
          </h3>

          {isLoading ? (
            <div className="text-sm text-muted-foreground py-4 text-center">
              Loading...
            </div>
          ) : activeLinks.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4 text-center">
              No active share links
            </div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-auto">
              {activeLinks.map((link) => (
                <div
                  key={link.id}
                  className="flex items-center justify-between p-3 border rounded-lg text-sm"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={
                        link.permission === 'editor'
                          ? 'text-blue-500'
                          : 'text-gray-500'
                      }>
                        {link.permission}
                      </span>
                      <span className="text-muted-foreground">
                        {link.useCount} use{link.useCount !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Created {formatRelativeTime(link.createdAt)}
                      {link.expiresAt && ` - expires ${formatRelativeTime(link.expiresAt)}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => copyLink(link.code, link.id)}
                      className="px-2 py-1 rounded hover:bg-accent transition-colors text-xs"
                    >
                      {copiedId === link.id ? 'Copied!' : 'Copy'}
                    </button>
                    <button
                      onClick={() => disableLink(link.id)}
                      className="px-2 py-1 rounded hover:bg-destructive/10 text-destructive transition-colors text-xs"
                    >
                      Disable
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
