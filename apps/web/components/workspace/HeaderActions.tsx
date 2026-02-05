'use client'

import { useState } from 'react'
import { ShareModal } from './ShareModal'
import { useWorkspace } from '@/app/w/[slug]/workspace-provider'

export function HeaderActions() {
  const { user } = useWorkspace()
  const [showShareModal, setShowShareModal] = useState(false)

  // Only show share for owners and editors
  if (user.role === 'viewer') return null

  return (
    <>
      <button
        onClick={() => setShowShareModal(true)}
        className="px-3 py-1.5 rounded-md border hover:bg-accent transition-colors text-sm"
      >
        Share
      </button>
      <ShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
      />
    </>
  )
}
