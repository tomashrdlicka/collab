import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function HomePage() {
  const session = await getServerSession(authOptions)

  if (session) {
    redirect('/dashboard')
  }

  return (
    <main className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl font-semibold">Collab</span>
          </div>
          <nav className="flex items-center gap-4">
            <Link
              href="/login"
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
            >
              Sign in with GitHub
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="flex-1 flex items-center justify-center">
        <div className="container mx-auto px-4 py-16 text-center">
          <h1 className="text-4xl md:text-6xl font-bold mb-6">
            Collaborative Markdown
            <br />
            <span className="text-muted-foreground">for AI Agents</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
            Real-time collaboration on documentation. Edit locally with Claude Code,
            review in the browser, auto-commit to GitHub.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link
              href="/login"
              className="px-6 py-3 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity text-lg"
            >
              Get Started
            </Link>
            <Link
              href="https://github.com"
              className="px-6 py-3 rounded-md border hover:bg-accent transition-colors text-lg"
            >
              View on GitHub
            </Link>
          </div>

          {/* Features */}
          <div className="grid md:grid-cols-3 gap-8 mt-20 text-left">
            <div className="p-6 rounded-lg border">
              <h3 className="text-lg font-semibold mb-2">Real-time Collaboration</h3>
              <p className="text-muted-foreground">
                Edit with teammates simultaneously. See live cursors,
                resolve conflicts with a click.
              </p>
            </div>
            <div className="p-6 rounded-lg border">
              <h3 className="text-lg font-semibold mb-2">Local Sync</h3>
              <p className="text-muted-foreground">
                CLI daemon syncs files bidirectionally. Claude Code edits,
                you review in the browser.
              </p>
            </div>
            <div className="p-6 rounded-lg border">
              <h3 className="text-lg font-semibold mb-2">Auto GitHub Commits</h3>
              <p className="text-muted-foreground">
                Changes auto-commit to GitHub with AI-generated messages.
                Full version history, zero friction.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          Built for developers who use AI coding agents.
        </div>
      </footer>
    </main>
  )
}
