import { describe, it, expect } from 'vitest'
import {
  diffLines,
  formatUnifiedDiff,
  getDiffSummary,
  hasDifferences,
  getDiffPreview,
} from '../diff'

describe('diff', () => {
  describe('diffLines', () => {
    it('returns empty array for identical texts', () => {
      const diffs = diffLines('hello', 'hello')
      const nonEqual = diffs.filter((d) => d.type !== 'equal')
      expect(nonEqual).toHaveLength(0)
    })

    it('detects added lines', () => {
      const diffs = diffLines('line1', 'line1\nline2')
      const adds = diffs.filter((d) => d.type === 'add')
      expect(adds.length).toBeGreaterThan(0)
      expect(adds.some((d) => d.newLine === 'line2')).toBe(true)
    })

    it('detects removed lines', () => {
      const diffs = diffLines('line1\nline2', 'line1')
      const removes = diffs.filter((d) => d.type === 'remove')
      expect(removes.length).toBeGreaterThan(0)
      expect(removes.some((d) => d.oldLine === 'line2')).toBe(true)
    })

    it('handles empty old text', () => {
      const diffs = diffLines('', 'new line')
      const adds = diffs.filter((d) => d.type === 'add')
      expect(adds.length).toBeGreaterThan(0)
    })

    it('handles empty new text', () => {
      const diffs = diffLines('old line', '')
      const removes = diffs.filter((d) => d.type === 'remove')
      expect(removes.length).toBeGreaterThan(0)
    })

    it('handles multiline changes', () => {
      const oldText = 'line1\nline2\nline3'
      const newText = 'line1\nmodified\nline3'
      const diffs = diffLines(oldText, newText)

      // Should have equal line1, some change for line2->modified, equal line3
      const equals = diffs.filter((d) => d.type === 'equal')
      expect(equals.length).toBeGreaterThanOrEqual(2) // line1 and line3
    })

    it('assigns line numbers', () => {
      const diffs = diffLines('a\nb\nc', 'a\nb\nc')
      for (const diff of diffs) {
        expect(diff.lineNumber).toBeGreaterThan(0)
      }
    })

    it('handles completely different texts', () => {
      const diffs = diffLines('alpha\nbeta', 'gamma\ndelta')
      const nonEqual = diffs.filter((d) => d.type !== 'equal')
      expect(nonEqual.length).toBeGreaterThan(0)
    })
  })

  describe('formatUnifiedDiff', () => {
    it('produces unified diff format with headers', () => {
      const diff = formatUnifiedDiff('old\nline', 'new\nline', 'file.old', 'file.new')
      expect(diff).toContain('--- file.old')
      expect(diff).toContain('+++ file.new')
    })

    it('uses default names when not provided', () => {
      const diff = formatUnifiedDiff('old', 'new')
      expect(diff).toContain('--- a')
      expect(diff).toContain('+++ b')
    })

    it('marks removed lines with -', () => {
      const diff = formatUnifiedDiff('removed line', 'different line')
      expect(diff).toContain('-removed line')
    })

    it('marks added lines with +', () => {
      const diff = formatUnifiedDiff('original', 'changed')
      expect(diff).toContain('+changed')
    })

    it('includes hunk headers with @@', () => {
      const diff = formatUnifiedDiff('old', 'new')
      expect(diff).toContain('@@')
    })

    it('returns just headers for identical content', () => {
      const diff = formatUnifiedDiff('same', 'same')
      expect(diff).toContain('--- a')
      expect(diff).toContain('+++ b')
      expect(diff).not.toContain('@@')
    })
  })

  describe('getDiffSummary', () => {
    it('returns zero for identical texts', () => {
      const summary = getDiffSummary('same', 'same')
      expect(summary.additions).toBe(0)
      expect(summary.deletions).toBe(0)
      expect(summary.changes).toBe(0)
    })

    it('counts additions', () => {
      const summary = getDiffSummary('line1', 'line1\nline2\nline3')
      expect(summary.additions).toBeGreaterThan(0)
    })

    it('counts deletions', () => {
      const summary = getDiffSummary('line1\nline2\nline3', 'line1')
      expect(summary.deletions).toBeGreaterThan(0)
    })

    it('changes equals additions + deletions', () => {
      const summary = getDiffSummary('old\nlines', 'new\nlines\nadded')
      expect(summary.changes).toBe(summary.additions + summary.deletions)
    })

    it('handles empty inputs', () => {
      const summary = getDiffSummary('', 'new content')
      expect(summary.additions).toBeGreaterThan(0)
      // Empty string still produces one empty line that gets "removed"
      // This is expected behavior from splitting '' on '\n' = ['']
    })
  })

  describe('hasDifferences', () => {
    it('returns false for identical texts', () => {
      expect(hasDifferences('same', 'same')).toBe(false)
    })

    it('returns true for different texts', () => {
      expect(hasDifferences('old', 'new')).toBe(true)
    })

    it('returns false for two empty strings', () => {
      expect(hasDifferences('', '')).toBe(false)
    })

    it('returns true when one is empty', () => {
      expect(hasDifferences('content', '')).toBe(true)
      expect(hasDifferences('', 'content')).toBe(true)
    })

    it('is case sensitive', () => {
      expect(hasDifferences('Hello', 'hello')).toBe(true)
    })

    it('detects whitespace differences', () => {
      expect(hasDifferences('hello ', 'hello')).toBe(true)
      expect(hasDifferences('hello\n', 'hello')).toBe(true)
    })
  })

  describe('getDiffPreview', () => {
    it('returns full diff when under maxLength', () => {
      const preview = getDiffPreview('a', 'b', 1000)
      expect(preview).not.toContain('truncated')
    })

    it('truncates long diffs', () => {
      const oldText = Array.from({ length: 100 }, (_, i) => `line ${i}`).join('\n')
      const newText = Array.from({ length: 100 }, (_, i) => `modified ${i}`).join('\n')
      const preview = getDiffPreview(oldText, newText, 100)
      expect(preview.length).toBeLessThanOrEqual(120) // maxLength + truncation message
      expect(preview).toContain('... (truncated)')
    })

    it('uses default maxLength of 500', () => {
      const oldText = Array.from({ length: 200 }, (_, i) => `line ${i}`).join('\n')
      const newText = Array.from({ length: 200 }, (_, i) => `changed ${i}`).join('\n')
      const preview = getDiffPreview(oldText, newText)
      // The preview should be truncated at around 500 chars
      expect(preview.length).toBeLessThanOrEqual(520)
    })
  })
})
