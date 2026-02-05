'use client'

import { useState, useEffect } from 'react'

interface Member {
  userId: string
  role: string
  githubUsername: string
  githubAvatarUrl: string | null
  joinedAt: string
}

interface MemberListProps {
  workspaceId: string
  isOwner: boolean
}

export function MemberList({ workspaceId, isOwner }: MemberListProps) {
  const [members, setMembers] = useState<Member[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [newUsername, setNewUsername] = useState('')
  const [newRole, setNewRole] = useState<'editor' | 'viewer'>('editor')
  const [isAdding, setIsAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchMembers()
  }, [workspaceId])

  async function fetchMembers() {
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/members`)
      if (response.ok) {
        const data = await response.json()
        setMembers(data.data ?? [])
      }
    } catch (err) {
      console.error('Failed to fetch members:', err)
    } finally {
      setIsLoading(false)
    }
  }

  async function handleAddMember() {
    if (!newUsername.trim()) return
    setIsAdding(true)
    setError(null)

    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          githubUsername: newUsername.trim(),
          role: newRole,
        }),
      })

      if (response.ok) {
        setNewUsername('')
        await fetchMembers()
      } else {
        const data = await response.json()
        setError(data.error?.message ?? 'Failed to add member')
      }
    } catch {
      setError('Failed to add member')
    } finally {
      setIsAdding(false)
    }
  }

  async function handleUpdateRole(userId: string, role: string) {
    try {
      await fetch(`/api/workspaces/${workspaceId}/members/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      })
      await fetchMembers()
    } catch (err) {
      console.error('Failed to update role:', err)
    }
  }

  async function handleRemoveMember(userId: string) {
    try {
      await fetch(`/api/workspaces/${workspaceId}/members/${userId}`, {
        method: 'DELETE',
      })
      await fetchMembers()
    } catch (err) {
      console.error('Failed to remove member:', err)
    }
  }

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading members...</div>
  }

  return (
    <div className="space-y-4">
      {/* Member list */}
      <div className="space-y-2">
        {members.map((member) => (
          <div
            key={member.userId}
            className="flex items-center justify-between p-3 border rounded-lg"
          >
            <div className="flex items-center gap-3">
              {member.githubAvatarUrl ? (
                <img
                  src={member.githubAvatarUrl}
                  alt={member.githubUsername}
                  className="w-8 h-8 rounded-full"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs">
                  {member.githubUsername.charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <span className="text-sm font-medium">@{member.githubUsername}</span>
                <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${
                  member.role === 'owner'
                    ? 'bg-purple-500/20 text-purple-600'
                    : member.role === 'editor'
                    ? 'bg-blue-500/20 text-blue-600'
                    : 'bg-gray-500/20 text-gray-600'
                }`}>
                  {member.role}
                </span>
              </div>
            </div>

            {isOwner && member.role !== 'owner' && (
              <div className="flex items-center gap-2">
                <select
                  value={member.role}
                  onChange={(e) => handleUpdateRole(member.userId, e.target.value)}
                  className="text-xs px-2 py-1 border rounded bg-background"
                >
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
                <button
                  onClick={() => handleRemoveMember(member.userId)}
                  className="text-xs px-2 py-1 rounded hover:bg-destructive/10 text-destructive transition-colors"
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add member form */}
      {isOwner && (
        <div className="border rounded-lg p-4">
          <h3 className="text-sm font-medium mb-3">Add Member</h3>
          {error && (
            <div className="mb-3 p-2 rounded bg-destructive/10 text-destructive text-xs">
              {error}
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="GitHub username"
              className="flex-1 px-3 py-2 border rounded-md bg-background text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddMember()
              }}
            />
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as 'editor' | 'viewer')}
              className="text-sm px-2 py-2 border rounded bg-background"
            >
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
            <button
              onClick={handleAddMember}
              disabled={isAdding || !newUsername.trim()}
              className="px-3 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 text-sm"
            >
              {isAdding ? 'Adding...' : 'Add'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
