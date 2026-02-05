'use client'

import { useState, useEffect } from 'react'
import { useWorkspace } from '../workspace-provider'
import { useRouter } from 'next/navigation'
import { MemberList } from '@/components/workspace/MemberList'

interface WorkspaceSettings {
  name: string
  githubRepo: string
  githubBranch: string
  autoCommitEnabled: boolean
  autoCommitIdleMinutes: number
  autoCommitMaxMinutes: number
}

export default function SettingsPage() {
  const { workspace, user } = useWorkspace()
  const router = useRouter()
  const [settings, setSettings] = useState<WorkspaceSettings | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Redirect non-owners
  useEffect(() => {
    if (user.role !== 'owner') {
      router.push(`/w/${workspace.slug}`)
    }
  }, [user.role, workspace.slug, router])

  useEffect(() => {
    async function fetchSettings() {
      try {
        const response = await fetch(`/api/workspaces/${workspace.id}`)
        if (response.ok) {
          const data = await response.json()
          const ws = data.data
          setSettings({
            name: ws.name,
            githubRepo: ws.githubRepo,
            githubBranch: ws.githubBranch,
            autoCommitEnabled: ws.autoCommitEnabled,
            autoCommitIdleMinutes: ws.autoCommitIdleMinutes,
            autoCommitMaxMinutes: ws.autoCommitMaxMinutes,
          })
        }
      } catch (error) {
        console.error('Failed to fetch settings:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchSettings()
  }, [workspace.id])

  async function handleSave() {
    if (!settings) return
    setIsSaving(true)
    setMessage(null)

    try {
      const response = await fetch(`/api/workspaces/${workspace.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: settings.name,
          autoCommitEnabled: settings.autoCommitEnabled,
          autoCommitIdleMinutes: settings.autoCommitIdleMinutes,
          autoCommitMaxMinutes: settings.autoCommitMaxMinutes,
        }),
      })

      if (response.ok) {
        setMessage({ type: 'success', text: 'Settings saved successfully.' })
      } else {
        const data = await response.json()
        setMessage({ type: 'error', text: data.error?.message ?? 'Failed to save settings.' })
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to save settings.' })
    } finally {
      setIsSaving(false)
    }
  }

  if (user.role !== 'owner') return null

  if (isLoading || !settings) {
    return (
      <div className="h-full overflow-auto p-6">
        <div className="max-w-2xl mx-auto">
          <div className="text-muted-foreground">Loading settings...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto p-6">
      <div className="max-w-2xl mx-auto space-y-8">
        <h1 className="text-2xl font-bold">Workspace Settings</h1>

        {message && (
          <div className={`p-3 rounded-md text-sm ${
            message.type === 'success'
              ? 'bg-green-500/10 text-green-600'
              : 'bg-destructive/10 text-destructive'
          }`}>
            {message.text}
          </div>
        )}

        {/* General */}
        <section>
          <h2 className="text-lg font-semibold mb-4">General</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Name</label>
              <input
                type="text"
                value={settings.name}
                onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                className="w-full px-3 py-2 border rounded-md bg-background text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">GitHub Repository</label>
              <input
                type="text"
                value={settings.githubRepo}
                disabled
                className="w-full px-3 py-2 border rounded-md bg-muted text-sm text-muted-foreground"
              />
              <p className="text-xs text-muted-foreground mt-1">Cannot be changed after creation.</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Branch</label>
              <input
                type="text"
                value={settings.githubBranch}
                disabled
                className="w-full px-3 py-2 border rounded-md bg-muted text-sm text-muted-foreground"
              />
            </div>
          </div>
        </section>

        {/* Commit Settings */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Auto-Commit Settings</h2>
          <div className="space-y-4">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={settings.autoCommitEnabled}
                onChange={(e) => setSettings({ ...settings, autoCommitEnabled: e.target.checked })}
                className="rounded"
              />
              <span className="text-sm">Enable auto-commit</span>
            </label>

            <div>
              <label className="block text-sm font-medium mb-1">
                Idle time before commit (minutes)
              </label>
              <input
                type="number"
                min={1}
                max={60}
                value={settings.autoCommitIdleMinutes}
                onChange={(e) => setSettings({
                  ...settings,
                  autoCommitIdleMinutes: parseInt(e.target.value, 10) || 5,
                })}
                disabled={!settings.autoCommitEnabled}
                className="w-32 px-3 py-2 border rounded-md bg-background text-sm disabled:bg-muted disabled:text-muted-foreground"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Maximum time before forced commit (minutes)
              </label>
              <input
                type="number"
                min={5}
                max={1440}
                value={settings.autoCommitMaxMinutes}
                onChange={(e) => setSettings({
                  ...settings,
                  autoCommitMaxMinutes: parseInt(e.target.value, 10) || 60,
                })}
                disabled={!settings.autoCommitEnabled}
                className="w-32 px-3 py-2 border rounded-md bg-background text-sm disabled:bg-muted disabled:text-muted-foreground"
              />
            </div>
          </div>
        </section>

        <button
          onClick={handleSave}
          disabled={isSaving}
          className="px-4 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 text-sm"
        >
          {isSaving ? 'Saving...' : 'Save Settings'}
        </button>

        {/* Members */}
        <section>
          <h2 className="text-lg font-semibold mb-4">Members</h2>
          <MemberList workspaceId={workspace.id} isOwner={user.role === 'owner'} />
        </section>
      </div>
    </div>
  )
}
