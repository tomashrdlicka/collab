'use client'

import { useState } from 'react'
import Link from 'next/link'
import { formatRelativeTime, getChangeTypeColor, getChangeTypeLabel } from '@/lib/utils'
import { CommitButton } from '@/components/workspace/CommitButton'
import { DiffViewer } from '@/components/workspace/DiffViewer'
import type { ImportResult } from '@collab/shared'

interface Change {
  id: string
  documentId: string
  userId: string | null
  userType: string
  agentName: string | null
  changeType: string
  summary: string | null
  diffPreview: string | null
  committed: boolean
  createdAt: Date
  documentPath: string | null
  userName: string | null
}

interface WorkspaceChangesProps {
  workspace: { id: string; name: string; githubRepo: string }
  changes: Change[]
  slug: string
}

export function WorkspaceChanges({ workspace, changes: initialChanges, slug }: WorkspaceChangesProps) {
  const [changes] = useState(initialChanges)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [isImporting, setIsImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)

  const uncommittedChanges = changes.filter((c) => !c.committed)
  const committedChanges = changes.filter((c) => c.committed)

  async function handleImport() {
    setIsImporting(true)
    setImportResult(null)
    try {
      const response = await fetch(`/api/workspaces/${workspace.id}/import`, {
        method: 'POST',
      })
      const data = await response.json()
      if (data.error) {
        console.error('Import failed:', data.error.message)
        return
      }
      setImportResult(data.data as ImportResult)
      // Reload to show imported files in changes
      if ((data.data as ImportResult).imported > 0) {
        setTimeout(() => window.location.reload(), 1500)
      }
    } catch (error) {
      console.error('Import failed:', error)
    } finally {
      setIsImporting(false)
    }
  }

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  function renderChange(change: Change) {
    const isExpanded = expandedIds.has(change.id)

    return (
      <div
        key={change.id}
        className="p-4 border rounded-lg hover:border-primary/50 transition-colors"
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">
              {change.userType === 'agent' ? '\u{1F916}' : '\u{1F464}'}
            </span>
            <div>
              <div className="font-medium">
                {change.userType === 'agent'
                  ? change.agentName ?? 'Agent'
                  : change.userName ?? 'Unknown'}
              </div>
              <div className="text-sm text-muted-foreground">
                <span className={getChangeTypeColor(change.changeType as 'create' | 'update' | 'delete')}>
                  {getChangeTypeLabel(change.changeType as 'create' | 'update' | 'delete')}
                </span>
                {' '}
                <Link
                  href={`/w/${slug}/${change.documentPath}`}
                  className="hover:underline"
                >
                  {change.documentPath}
                </Link>
              </div>
            </div>
          </div>
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            {formatRelativeTime(change.createdAt)}
            {!change.committed && (
              <span className="px-1.5 py-0.5 text-xs bg-yellow-500/20 text-yellow-600 rounded">
                uncommitted
              </span>
            )}
          </div>
        </div>

        {change.summary && (
          <p className="mt-2 text-sm text-muted-foreground">
            {change.summary}
          </p>
        )}

        {change.diffPreview && (
          <div className="mt-2">
            <button
              onClick={() => toggleExpand(change.id)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {isExpanded ? 'Hide diff' : 'Show diff'}
            </button>
            {isExpanded && (
              <div className="mt-2">
                <DiffViewer diff={change.diffPreview} />
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">{workspace.name}</h1>
            <p className="text-muted-foreground">{workspace.githubRepo}</p>
          </div>
          <CommitButton
            uncommittedCount={uncommittedChanges.length}
            onCommitted={() => window.location.reload()}
          />
        </div>

        {/* Uncommitted Changes */}
        {uncommittedChanges.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold mb-4">
              Uncommitted Changes ({uncommittedChanges.length})
            </h2>
            <div className="space-y-3">
              {uncommittedChanges.map(renderChange)}
            </div>
          </div>
        )}

        {/* Committed Changes */}
        <div>
          <h2 className="text-lg font-semibold mb-4">
            {uncommittedChanges.length > 0 ? 'Committed History' : 'Recent Changes'}
          </h2>

          {committedChanges.length === 0 && uncommittedChanges.length === 0 ? (
            <div className="text-center py-12 border rounded-lg">
              {importResult ? (
                <div>
                  <p className="font-medium">
                    Imported {importResult.imported} file{importResult.imported !== 1 ? 's' : ''}
                  </p>
                  {importResult.skipped > 0 && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {importResult.skipped} skipped (already exist)
                    </p>
                  )}
                  {importResult.errors > 0 && (
                    <p className="text-sm text-destructive mt-1">
                      {importResult.errors} error{importResult.errors !== 1 ? 's' : ''}
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  <p className="text-muted-foreground mb-1">No files in this workspace yet.</p>
                  <p className="text-sm text-muted-foreground mb-4">
                    Import existing markdown files from{' '}
                    <span className="font-medium text-foreground">{workspace.githubRepo}</span>
                  </p>
                  <button
                    onClick={handleImport}
                    disabled={isImporting}
                    className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {isImporting ? 'Importing...' : 'Import from GitHub'}
                  </button>
                </div>
              )}
            </div>
          ) : committedChanges.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              No committed changes yet.
            </div>
          ) : (
            <div className="space-y-3">
              {committedChanges.map(renderChange)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
