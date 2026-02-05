'use client'

interface DiffViewerProps {
  diff: string
}

export function DiffViewer({ diff }: DiffViewerProps) {
  if (!diff) return null

  const lines = diff.split('\n')

  return (
    <pre className="text-xs font-mono overflow-x-auto rounded-md border p-3 bg-muted/30">
      {lines.map((line, i) => {
        let className = 'block'

        if (line.startsWith('+') && !line.startsWith('+++')) {
          className += ' text-green-600 bg-green-500/10'
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          className += ' text-red-600 bg-red-500/10'
        } else if (line.startsWith('@@')) {
          className += ' text-blue-500'
        } else if (line.startsWith('---') || line.startsWith('+++')) {
          className += ' text-muted-foreground font-semibold'
        } else {
          className += ' text-muted-foreground'
        }

        return (
          <span key={i} className={className}>
            {line}
            {'\n'}
          </span>
        )
      })}
    </pre>
  )
}
