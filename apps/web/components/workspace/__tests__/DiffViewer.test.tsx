import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DiffViewer } from '../DiffViewer'

describe('DiffViewer', () => {
  it('renders nothing when diff is empty', () => {
    const { container } = render(<DiffViewer diff="" />)
    expect(container.innerHTML).toBe('')
  })

  it('renders a pre element with diff content', () => {
    render(<DiffViewer diff="some diff" />)
    const pre = screen.getByText('some diff')
    expect(pre).toBeInTheDocument()
  })

  it('applies green styling to addition lines', () => {
    render(<DiffViewer diff={'+added line'} />)
    const line = screen.getByText('+added line')
    expect(line.className).toContain('text-green-600')
    expect(line.className).toContain('bg-green-500/10')
  })

  it('applies red styling to removal lines', () => {
    render(<DiffViewer diff={'-removed line'} />)
    const line = screen.getByText('-removed line')
    expect(line.className).toContain('text-red-600')
    expect(line.className).toContain('bg-red-500/10')
  })

  it('applies blue styling to hunk headers', () => {
    render(<DiffViewer diff={'@@ -1,3 +1,4 @@'} />)
    const line = screen.getByText('@@ -1,3 +1,4 @@')
    expect(line.className).toContain('text-blue-500')
  })

  it('applies muted bold styling to file headers (--- and +++)', () => {
    const diff = '--- a/file.txt\n+++ b/file.txt'
    render(<DiffViewer diff={diff} />)

    const minusHeader = screen.getByText('--- a/file.txt')
    expect(minusHeader.className).toContain('text-muted-foreground')
    expect(minusHeader.className).toContain('font-semibold')

    const plusHeader = screen.getByText('+++ b/file.txt')
    expect(plusHeader.className).toContain('text-muted-foreground')
    expect(plusHeader.className).toContain('font-semibold')
  })

  it('does not apply addition styling to +++ file headers', () => {
    render(<DiffViewer diff={'+++ b/file.txt'} />)
    const line = screen.getByText('+++ b/file.txt')
    expect(line.className).not.toContain('text-green-600')
  })

  it('does not apply removal styling to --- file headers', () => {
    render(<DiffViewer diff={'--- a/file.txt'} />)
    const line = screen.getByText('--- a/file.txt')
    expect(line.className).not.toContain('text-red-600')
  })

  it('applies muted styling to context lines', () => {
    render(<DiffViewer diff={' context line'} />)
    const line = screen.getByText('context line')
    expect(line.className).toContain('text-muted-foreground')
  })

  it('renders multiple lines with correct styling', () => {
    const diff = [
      '--- a/file.txt',
      '+++ b/file.txt',
      '@@ -1,3 +1,4 @@',
      ' unchanged',
      '-removed',
      '+added',
    ].join('\n')

    const { container } = render(<DiffViewer diff={diff} />)
    const spans = container.querySelectorAll('span')
    // 6 lines of content
    expect(spans.length).toBe(6)
  })
})
