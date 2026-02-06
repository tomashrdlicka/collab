'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useWorkspace } from '@/app/w/[slug]/workspace-provider'
import type { ImportResult } from '@collab/shared'

interface SidebarProps {
  workspaceId: string
}

interface FileNode {
  name: string
  path: string
  type: 'file' | 'dir'
  children?: FileNode[]
  isModified?: boolean
  isNew?: boolean
}

export function Sidebar({ workspaceId }: SidebarProps) {
  const pathname = usePathname()
  const { user } = useWorkspace()
  const [files, setFiles] = useState<FileNode[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())
  const [isImporting, setIsImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)

  const canEdit = user.role === 'owner' || user.role === 'editor'

  const fetchFiles = useCallback(async () => {
    try {
      const [docsResponse, changesResponse] = await Promise.all([
        fetch(`/api/workspaces/${workspaceId}/documents`),
        fetch(`/api/workspaces/${workspaceId}/changes/uncommitted`),
      ])

      const docsData = docsResponse.ok ? await docsResponse.json() : { data: [] }
      const changesData = changesResponse.ok ? await changesResponse.json() : { data: [] }

      const modifiedPaths = new Set<string>()
      const newPaths = new Set<string>()

      for (const change of changesData.data ?? []) {
        if (change.changeType === 'create') {
          newPaths.add(change.documentPath)
        } else if (change.changeType === 'update') {
          modifiedPaths.add(change.documentPath)
        }
      }

      setFiles(buildFileTree(docsData.data ?? [], modifiedPaths, newPaths))
    } catch (error) {
      console.error('Failed to fetch files:', error)
    } finally {
      setIsLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    fetchFiles()
  }, [fetchFiles])

  async function handleImport() {
    setIsImporting(true)
    setImportResult(null)
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/import`, {
        method: 'POST',
      })
      const data = await response.json()
      if (data.error) {
        console.error('Import failed:', data.error.message)
        return
      }
      setImportResult(data.data as ImportResult)
      // Refresh file list after import
      await fetchFiles()
    } catch (error) {
      console.error('Import failed:', error)
    } finally {
      setIsImporting(false)
    }
  }

  function buildFileTree(
    documents: Array<{ path: string; contentHash?: string }>,
    modifiedPaths: Set<string> = new Set(),
    newPaths: Set<string> = new Set()
  ): FileNode[] {
    const root: FileNode[] = []
    const dirs = new Map<string, FileNode>()

    for (const doc of documents) {
      const parts = doc.path.split('/')
      let currentPath = ''
      let currentLevel = root

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i]!
        const isFile = i === parts.length - 1
        currentPath = currentPath ? `${currentPath}/${part}` : part

        if (isFile) {
          currentLevel.push({
            name: part,
            path: currentPath,
            type: 'file',
            isModified: modifiedPaths.has(currentPath),
            isNew: newPaths.has(currentPath),
          })
        } else {
          let dir = dirs.get(currentPath)
          if (!dir) {
            dir = {
              name: part,
              path: currentPath,
              type: 'dir',
              children: [],
            }
            dirs.set(currentPath, dir)
            currentLevel.push(dir)
          }
          currentLevel = dir.children!
        }
      }
    }

    return sortFiles(root)
  }

  function sortFiles(nodes: FileNode[]): FileNode[] {
    return nodes.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'dir' ? -1 : 1
      }
      return a.name.localeCompare(b.name)
    }).map((node) => ({
      ...node,
      children: node.children ? sortFiles(node.children) : undefined,
    }))
  }

  function toggleDir(path: string) {
    setExpandedDirs((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }

  function renderNode(node: FileNode, depth = 0) {
    const workspaceSlug = pathname.split('/')[2]
    const isActive = pathname === `/w/${workspaceSlug}/${node.path}`
    const isExpanded = expandedDirs.has(node.path)

    if (node.type === 'dir') {
      return (
        <div key={node.path}>
          <button
            onClick={() => toggleDir(node.path)}
            className={cn(
              'file-tree-item w-full text-left',
              'text-sm'
            )}
            style={{ paddingLeft: `${depth * 0.75 + 0.5}rem` }}
          >
            <span className="text-muted-foreground">
              {isExpanded ? '\u25BC' : '\u25B6'}
            </span>
            <span>{node.name}</span>
          </button>
          {isExpanded && node.children && (
            <div>
              {node.children.map((child) => renderNode(child, depth + 1))}
            </div>
          )}
        </div>
      )
    }

    return (
      <Link
        key={node.path}
        href={`/w/${workspaceSlug}/${node.path}`}
        className={cn(
          'file-tree-item',
          'text-sm',
          isActive && 'active'
        )}
        style={{ paddingLeft: `${depth * 0.75 + 0.5}rem` }}
      >
        <span className="text-muted-foreground">{'\uD83D\uDCC4'}</span>
        <span className="flex-1 truncate">{node.name}</span>
        {node.isModified && <span className="change-indicator modified" />}
        {node.isNew && <span className="change-indicator new" />}
      </Link>
    )
  }

  return (
    <aside className="w-64 border-r flex flex-col flex-shrink-0">
      {/* Header */}
      <div className="h-10 px-4 border-b flex items-center justify-between">
        <span className="text-sm font-medium">Files</span>
        <div className="flex items-center gap-1">
          {canEdit && (
            <button
              onClick={handleImport}
              disabled={isImporting}
              className="p-1 rounded hover:bg-accent transition-colors disabled:opacity-50"
              title="Import from GitHub"
            >
              <span className="text-sm">{isImporting ? '...' : '\u2B07'}</span>
            </button>
          )}
          <button
            className="p-1 rounded hover:bg-accent transition-colors"
            title="New file"
          >
            <span>+</span>
          </button>
        </div>
      </div>

      {/* Import result banner */}
      {importResult && (
        <div className="px-3 py-2 border-b bg-accent/50 text-xs">
          <div className="font-medium">
            Imported {importResult.imported} file{importResult.imported !== 1 ? 's' : ''}
          </div>
          {importResult.skipped > 0 && (
            <div className="text-muted-foreground">
              {importResult.skipped} skipped (already exist)
            </div>
          )}
          {importResult.errors > 0 && (
            <div className="text-destructive">
              {importResult.errors} error{importResult.errors !== 1 ? 's' : ''}
            </div>
          )}
          <button
            onClick={() => setImportResult(null)}
            className="text-muted-foreground hover:text-foreground mt-1"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* File tree */}
      <div className="flex-1 overflow-auto py-2">
        {isLoading ? (
          <div className="px-4 py-2 text-sm text-muted-foreground">
            Loading...
          </div>
        ) : files.length === 0 ? (
          <div className="px-4 py-6 text-center">
            <p className="text-sm text-muted-foreground mb-3">No files yet</p>
            {canEdit && (
              <button
                onClick={handleImport}
                disabled={isImporting}
                className="text-sm px-3 py-1.5 rounded border hover:bg-accent transition-colors disabled:opacity-50"
              >
                {isImporting ? 'Importing...' : 'Import from GitHub'}
              </button>
            )}
          </div>
        ) : (
          files.map((node) => renderNode(node))
        )}
      </div>

      {/* Footer with workspace links */}
      <div className="border-t p-2 space-y-1">
        <Link
          href={`/w/${pathname.split('/')[2]}`}
          className={cn(
            'file-tree-item w-full text-sm',
            pathname.split('/').length === 3 && !pathname.endsWith('/settings') && 'active'
          )}
        >
          <span>{'\uD83D\uDCCA'}</span>
          <span>Changes</span>
        </Link>
        <Link
          href={`/w/${pathname.split('/')[2]}/settings`}
          className={cn(
            'file-tree-item w-full text-sm',
            pathname.endsWith('/settings') && 'active'
          )}
        >
          <span>{'\u2699\uFE0F'}</span>
          <span>Settings</span>
        </Link>
      </div>
    </aside>
  )
}
