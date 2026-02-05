import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { authOptions } from '@/lib/auth'
import { getDatabase } from '@/lib/db'
import { workspaces, workspaceMembers } from '@collab/db/schema'
import { eq, or } from 'drizzle-orm'
import { formatRelativeTime } from '@/lib/utils'

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect('/login')
  }

  const db = getDatabase()

  // Get user's workspaces (owned or member)
  const userWorkspaces = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      slug: workspaces.slug,
      githubRepo: workspaces.githubRepo,
      lastCommitAt: workspaces.lastCommitAt,
      createdAt: workspaces.createdAt,
    })
    .from(workspaces)
    .leftJoin(workspaceMembers, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(
      or(
        eq(workspaces.ownerId, session.user.id),
        eq(workspaceMembers.userId, session.user.id)
      )
    )
    .orderBy(workspaces.updatedAt)

  return (
    <main className="min-h-screen">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/dashboard" className="text-xl font-semibold">
            Collab
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              @{session.user.githubUsername}
            </span>
            {session.user.image && (
              <img
                src={session.user.image}
                alt=""
                className="w-8 h-8 rounded-full"
              />
            )}
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold">Workspaces</h1>
          <Link
            href="/dashboard/new"
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          >
            New Workspace
          </Link>
        </div>

        {userWorkspaces.length === 0 ? (
          <div className="text-center py-16 border rounded-lg">
            <h3 className="text-lg font-medium mb-2">No workspaces yet</h3>
            <p className="text-muted-foreground mb-4">
              Create a workspace to start collaborating on markdown docs.
            </p>
            <Link
              href="/dashboard/new"
              className="inline-flex px-4 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
            >
              Create your first workspace
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {userWorkspaces.map((workspace) => (
              <Link
                key={workspace.id}
                href={`/w/${workspace.slug}`}
                className="block p-6 border rounded-lg hover:border-primary transition-colors"
              >
                <h3 className="font-semibold mb-1">{workspace.name}</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {workspace.githubRepo}
                </p>
                <p className="text-xs text-muted-foreground">
                  {workspace.lastCommitAt
                    ? `Last commit ${formatRelativeTime(workspace.lastCommitAt)}`
                    : `Created ${formatRelativeTime(workspace.createdAt)}`}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
