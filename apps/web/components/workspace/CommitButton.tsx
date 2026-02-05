'use client'

import { useState } from 'react'
import { CommitModal } from './CommitModal'

interface CommitButtonProps {
  uncommittedCount: number
  onCommitted?: () => void
}

export function CommitButton({ uncommittedCount, onCommitted }: CommitButtonProps) {
  const [showModal, setShowModal] = useState(false)

  if (uncommittedCount === 0) return null

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="px-4 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
      >
        Commit {uncommittedCount} change{uncommittedCount > 1 ? 's' : ''}
      </button>
      <CommitModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        uncommittedCount={uncommittedCount}
        onCommitted={() => {
          setShowModal(false)
          onCommitted?.()
        }}
      />
    </>
  )
}
