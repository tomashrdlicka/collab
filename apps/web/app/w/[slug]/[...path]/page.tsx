'use client'

import { useWorkspace } from '../workspace-provider'
import { CollabEditor } from '@/components/editor/CollabEditor'

interface DocumentPageProps {
  params: {
    slug: string
    path: string[]
  }
}

export default function DocumentPage({ params }: DocumentPageProps) {
  const { workspace, user } = useWorkspace()
  const documentPath = params.path.join('/')

  return (
    <div className="h-full flex flex-col">
      {/* Document header */}
      <div className="h-10 border-b flex items-center px-4 gap-4">
        <span className="font-mono text-sm">{documentPath}</span>
        <div className="flex-1" />
        <div className="sync-status synced">
          <span className="dot" />
          <span>Synced</span>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-hidden">
        <CollabEditor
          workspaceId={workspace.id}
          documentPath={documentPath}
          userId={user.id}
          userName={user.name}
          readOnly={user.role === 'viewer'}
        />
      </div>
    </div>
  )
}
