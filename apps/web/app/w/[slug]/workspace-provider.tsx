'use client'

import { createContext, useContext, type ReactNode } from 'react'

interface WorkspaceContextValue {
  workspace: {
    id: string
    name: string
    slug: string
    githubRepo: string
    githubBranch: string
  }
  user: {
    id: string
    name: string
    role: 'owner' | 'editor' | 'viewer'
  }
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

export function useWorkspace() {
  const context = useContext(WorkspaceContext)
  if (!context) {
    throw new Error('useWorkspace must be used within WorkspaceProvider')
  }
  return context
}

interface WorkspaceProviderProps {
  children: ReactNode
  workspace: WorkspaceContextValue['workspace']
  user: WorkspaceContextValue['user']
}

export function WorkspaceProvider({
  children,
  workspace,
  user,
}: WorkspaceProviderProps) {
  return (
    <WorkspaceContext.Provider value={{ workspace, user }}>
      {children}
    </WorkspaceContext.Provider>
  )
}
