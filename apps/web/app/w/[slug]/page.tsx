import { getDatabase } from '@/lib/db'
import { documentChanges, documents, users } from '@collab/db/schema'
import { eq, desc } from 'drizzle-orm'
import { WorkspaceChanges } from './workspace-changes'

interface WorkspacePageProps {
  params: { slug: string }
}

export default async function WorkspacePage({ params }: WorkspacePageProps) {
  const db = getDatabase()

  // Get workspace
  const [workspace] = await db.query.workspaces.findMany({
    where: (workspaces, { eq }) => eq(workspaces.slug, params.slug),
    limit: 1,
  })

  if (!workspace) {
    return <div>Workspace not found</div>
  }

  // Get recent changes
  const recentChanges = await db
    .select({
      id: documentChanges.id,
      documentId: documentChanges.documentId,
      userId: documentChanges.userId,
      userType: documentChanges.userType,
      agentName: documentChanges.agentName,
      changeType: documentChanges.changeType,
      summary: documentChanges.summary,
      diffPreview: documentChanges.diffPreview,
      committed: documentChanges.committed,
      createdAt: documentChanges.createdAt,
      documentPath: documents.path,
      userName: users.githubUsername,
    })
    .from(documentChanges)
    .leftJoin(documents, eq(documentChanges.documentId, documents.id))
    .leftJoin(users, eq(documentChanges.userId, users.id))
    .where(eq(documentChanges.workspaceId, workspace.id))
    .orderBy(desc(documentChanges.createdAt))
    .limit(50)

  return (
    <WorkspaceChanges
      workspace={{ id: workspace.id, name: workspace.name, githubRepo: workspace.githubRepo }}
      changes={recentChanges}
      slug={params.slug}
    />
  )
}
