/**
 * Represents a single change between two texts
 */
export interface DiffChange {
  type: 'add' | 'remove' | 'equal'
  value: string
  lineNumber?: number
}

/**
 * Represents a line-level diff
 */
export interface LineDiff {
  lineNumber: number
  type: 'add' | 'remove' | 'modify' | 'equal'
  oldLine?: string | undefined
  newLine?: string | undefined
}

/**
 * Simple line-by-line diff algorithm
 */
export function diffLines(oldText: string, newText: string): LineDiff[] {
  const oldLines = oldText.split('\n')
  const newLines = newText.split('\n')
  const diffs: LineDiff[] = []

  // Use LCS (Longest Common Subsequence) approach for better diffs
  const lcs = computeLCS(oldLines, newLines)
  const lcsSet = new Set(lcs.map((l) => l.oldIndex + ':' + l.newIndex))

  let oldIdx = 0
  let newIdx = 0
  let lineNumber = 1

  while (oldIdx < oldLines.length || newIdx < newLines.length) {
    const key = oldIdx + ':' + newIdx

    if (lcsSet.has(key)) {
      // Lines match
      diffs.push({
        lineNumber,
        type: 'equal',
        oldLine: oldLines[oldIdx],
        newLine: newLines[newIdx],
      })
      oldIdx++
      newIdx++
    } else if (oldIdx < oldLines.length && !hasMatchingNewLine(oldIdx, newLines, lcs)) {
      // Line was removed
      diffs.push({
        lineNumber,
        type: 'remove',
        oldLine: oldLines[oldIdx],
      })
      oldIdx++
    } else if (newIdx < newLines.length && !hasMatchingOldLine(newIdx, oldLines, lcs)) {
      // Line was added
      diffs.push({
        lineNumber,
        type: 'add',
        newLine: newLines[newIdx],
      })
      newIdx++
    } else {
      // Modified line (removed old + added new)
      if (oldIdx < oldLines.length) {
        diffs.push({
          lineNumber,
          type: 'remove',
          oldLine: oldLines[oldIdx],
        })
        oldIdx++
      }
      if (newIdx < newLines.length) {
        diffs.push({
          lineNumber,
          type: 'add',
          newLine: newLines[newIdx],
        })
        newIdx++
      }
    }
    lineNumber++
  }

  return diffs
}

interface LCSMatch {
  oldIndex: number
  newIndex: number
  value: string
}

function computeLCS(oldLines: string[], newLines: string[]): LCSMatch[] {
  const m = oldLines.length
  const n = newLines.length

  // Build LCS table
  const dp: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0))

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i]![j] = dp[i - 1]![j - 1]! + 1
      } else {
        dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!)
      }
    }
  }

  // Backtrack to find LCS
  const lcs: LCSMatch[] = []
  let i = m
  let j = n

  while (i > 0 && j > 0) {
    if (oldLines[i - 1] === newLines[j - 1]) {
      lcs.unshift({
        oldIndex: i - 1,
        newIndex: j - 1,
        value: oldLines[i - 1]!,
      })
      i--
      j--
    } else if (dp[i - 1]![j]! > dp[i]![j - 1]!) {
      i--
    } else {
      j--
    }
  }

  return lcs
}

function hasMatchingNewLine(
  oldIdx: number,
  newLines: string[],
  lcs: LCSMatch[]
): boolean {
  return lcs.some((match) => match.oldIndex === oldIdx)
}

function hasMatchingOldLine(
  newIdx: number,
  oldLines: string[],
  lcs: LCSMatch[]
): boolean {
  return lcs.some((match) => match.newIndex === newIdx)
}

/**
 * Format a diff for display (unified diff format)
 */
export function formatUnifiedDiff(
  oldText: string,
  newText: string,
  oldName = 'a',
  newName = 'b'
): string {
  const diffs = diffLines(oldText, newText)
  const lines: string[] = []

  lines.push(`--- ${oldName}`)
  lines.push(`+++ ${newName}`)

  let hunkStart = -1
  let hunkLines: string[] = []

  const flushHunk = () => {
    if (hunkLines.length > 0) {
      lines.push(`@@ -${hunkStart} @@`)
      lines.push(...hunkLines)
      hunkLines = []
    }
  }

  for (const diff of diffs) {
    if (diff.type === 'equal') {
      if (hunkLines.length > 0) {
        // Add context line
        hunkLines.push(` ${diff.oldLine ?? ''}`)
      }
    } else {
      if (hunkStart === -1) {
        hunkStart = diff.lineNumber
      }
      if (diff.type === 'remove') {
        hunkLines.push(`-${diff.oldLine ?? ''}`)
      } else if (diff.type === 'add') {
        hunkLines.push(`+${diff.newLine ?? ''}`)
      }
    }

    // Flush hunk after 3 consecutive equal lines
    if (diff.type === 'equal' && hunkLines.length > 0) {
      const equalCount = hunkLines.filter((l) => l.startsWith(' ')).length
      if (equalCount >= 3) {
        flushHunk()
        hunkStart = -1
      }
    }
  }

  flushHunk()

  return lines.join('\n')
}

/**
 * Get a summary of changes
 */
export function getDiffSummary(
  oldText: string,
  newText: string
): { additions: number; deletions: number; changes: number } {
  const diffs = diffLines(oldText, newText)

  let additions = 0
  let deletions = 0

  for (const diff of diffs) {
    if (diff.type === 'add') additions++
    if (diff.type === 'remove') deletions++
  }

  return {
    additions,
    deletions,
    changes: additions + deletions,
  }
}

/**
 * Check if two texts are different
 */
export function hasDifferences(oldText: string, newText: string): boolean {
  return oldText !== newText
}

/**
 * Get the first N characters of a diff preview
 */
export function getDiffPreview(oldText: string, newText: string, maxLength = 500): string {
  const diff = formatUnifiedDiff(oldText, newText)
  if (diff.length <= maxLength) {
    return diff
  }
  return diff.slice(0, maxLength) + '\n... (truncated)'
}
