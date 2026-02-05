'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

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
  const [files, setFiles] = useState<FileNode[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())

  useEffect(() => {
    async function fetchFiles() {
      try {
        // Fetch documents and uncommitted changes in parallel
        const [docsResponse, changesResponse] = await Promise.all([
          fetch(`/api/workspaces/${workspaceId}/documents`),
          fetch(`/api/workspaces/${workspaceId}/changes/uncommitted`),
        ])

        const docsData = docsResponse.ok ? await docsResponse.json() : { data: [] }
        const changesData = changesResponse.ok ? await changesResponse.json() : { data: [] }

        // Build sets of modified and new document paths
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
    }

    fetchFiles()
  }, [workspaceId])

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
      // Directories first
      if (a.type !== b.type) {
        return a.type === 'dir' ? -1 : 1
      }
      // Then alphabetically
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
              {isExpanded ? '▼' : '▶'}
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
        <span className="text-muted-foreground">📄</span>
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
        <button
          className="p-1 rounded hover:bg-accent transition-colors"
          title="New file"
        >
          <span>+</span>
        </button>
      </div>

      {/* File tree */}
      <div className="flex-1 overflow-auto py-2">
        {isLoading ? (
          <div className="px-4 py-2 text-sm text-muted-foreground">
            Loading...
          </div>
        ) : files.length === 0 ? (
          <div className="px-4 py-2 text-sm text-muted-foreground">
            No files yet
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
          <span>📊</span>
          <span>Changes</span>
        </Link>
        <Link
          href={`/w/${pathname.split('/')[2]}/settings`}
          className={cn(
            'file-tree-item w-full text-sm',
            pathname.endsWith('/settings') && 'active'
          )}
        >
          <span>⚙️</span>
          <span>Settings</span>
        </Link>
      </div>
    </aside>
  )
}
