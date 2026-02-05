import { getServerSession } from 'next-auth'
import { redirect, notFound } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import { workspaces, workspaceMembers } from '@collab/db/schema'
import { eq, or, and } from 'drizzle-orm'
import { WorkspaceProvider } from './workspace-provider'
import { Sidebar } from '@/components/sidebar/Sidebar'
import { HeaderActions } from '@/components/workspace/HeaderActions'

interface WorkspaceLayoutProps {
  children: React.ReactNode
  params: { slug: string }
}

export default async function WorkspaceLayout({
  children,
  params,
}: WorkspaceLayoutProps) {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect('/login')
  }

  const db = getDatabase()

  // Get workspace by slug
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.slug, params.slug))
    .limit(1)

  if (!workspace) {
    notFound()
  }

  // Check membership
  const [membership] = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspace.id),
        eq(workspaceMembers.userId, session.user.id)
      )
    )
    .limit(1)

  const isOwner = workspace.ownerId === session.user.id
  const isMember = membership !== undefined

  if (!isOwner && !isMember) {
    // Not authorized
    redirect('/dashboard')
  }

  const role = isOwner ? 'owner' : (membership?.role ?? 'viewer')

  return (
    <WorkspaceProvider
      workspace={{
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        githubRepo: workspace.githubRepo,
        githubBranch: workspace.githubBranch,
      }}
      user={{
        id: session.user.id,
        name: session.user.name ?? session.user.githubUsername,
        role: role as 'owner' | 'editor' | 'viewer',
      }}
    >
      <div className="h-screen flex flex-col">
        {/* Header */}
        <header className="h-12 border-b flex items-center justify-between px-4 flex-shrink-0">
          <div className="flex items-center gap-4">
            <a href="/dashboard" className="font-semibold">
              Collab
            </a>
            <span className="text-muted-foreground">/</span>
            <span>{workspace.name}</span>
          </div>
          <div className="flex items-center gap-2">
            <HeaderActions />
            <span className="text-sm text-muted-foreground">
              @{session.user.githubUsername}
            </span>
          </div>
        </header>

        {/* Main content */}
        <div className="flex-1 flex overflow-hidden">
          <Sidebar workspaceId={workspace.id} />
          <main className="flex-1 overflow-hidden">{children}</main>
        </div>
      </div>
    </WorkspaceProvider>
  )
}
