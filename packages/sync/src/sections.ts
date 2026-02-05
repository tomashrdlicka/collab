import { HEADING_PATTERN, FRONTMATTER_PATTERN } from '@collab/shared'

/**
 * Represents a section of a markdown document
 */
export interface Section {
  heading: string
  level: number
  startLine: number
  endLine: number
  startOffset: number
  endOffset: number
  content: string
}

/**
 * Represents the frontmatter of a markdown document
 */
export interface Frontmatter {
  raw: string
  data: Record<string, unknown>
  startLine: number
  endLine: number
  startOffset: number
  endOffset: number
}

/**
 * Parse frontmatter from markdown content
 */
export function parseFrontmatter(content: string): Frontmatter | null {
  const match = content.match(FRONTMATTER_PATTERN)
  if (!match) return null

  const raw = match[1] ?? ''
  const fullMatch = match[0]
  const endOffset = fullMatch.length

  // Simple YAML-like parsing
  const data: Record<string, unknown> = {}
  const lines = raw.split('\n')

  for (const line of lines) {
    const colonIndex = line.indexOf(':')
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim()
      const rawValue = line.slice(colonIndex + 1).trim()
      let value: unknown = rawValue

      // Try to parse as JSON for arrays/objects
      if (rawValue.startsWith('[') || rawValue.startsWith('{')) {
        try {
          value = JSON.parse(rawValue)
        } catch {
          // Keep as string
        }
      } else if (rawValue === 'true') {
        value = true
      } else if (rawValue === 'false') {
        value = false
      } else if (!isNaN(Number(rawValue)) && rawValue !== '') {
        value = Number(rawValue)
      }

      data[key] = value
    }
  }

  // Count lines in frontmatter
  const endLine = fullMatch.split('\n').length

  return {
    raw,
    data,
    startLine: 1,
    endLine,
    startOffset: 0,
    endOffset,
  }
}

/**
 * Parse sections from markdown content
 */
export function parseSections(content: string): Section[] {
  const sections: Section[] = []
  const lines = content.split('\n')
  let currentOffset = 0

  // Track headings and their positions
  const headings: Array<{
    heading: string
    level: number
    lineNumber: number
    offset: number
  }> = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const match = line.match(/^(#{1,6})\s+(.+)$/)

    if (match) {
      headings.push({
        heading: match[2]!,
        level: match[1]!.length,
        lineNumber: i + 1,
        offset: currentOffset,
      })
    }

    currentOffset += line.length + 1 // +1 for newline
  }

  // Build sections from headings
  for (let i = 0; i < headings.length; i++) {
    const current = headings[i]!
    const next = headings[i + 1]

    // Find where this section ends
    let endLine: number
    let endOffset: number

    if (next) {
      endLine = next.lineNumber - 1
      endOffset = next.offset
    } else {
      endLine = lines.length
      endOffset = content.length
    }

    // Extract section content
    const sectionContent = content.slice(current.offset, endOffset).trim()

    sections.push({
      heading: current.heading,
      level: current.level,
      startLine: current.lineNumber,
      endLine,
      startOffset: current.offset,
      endOffset,
      content: sectionContent,
    })
  }

  return sections
}

/**
 * Get a specific section by heading
 */
export function getSection(content: string, heading: string): Section | null {
  const sections = parseSections(content)
  return sections.find((s) => s.heading.toLowerCase() === heading.toLowerCase()) ?? null
}

/**
 * Get all section headings
 */
export function getSectionHeadings(content: string): string[] {
  const sections = parseSections(content)
  return sections.map((s) => s.heading)
}

/**
 * Update a specific section's content
 */
export function updateSection(
  content: string,
  heading: string,
  newSectionContent: string
): string {
  const section = getSection(content, heading)
  if (!section) {
    throw new Error(`Section "${heading}" not found`)
  }

  // Build the new section with the heading preserved
  const headingPrefix = '#'.repeat(section.level)
  const newContent = `${headingPrefix} ${heading}\n\n${newSectionContent.trim()}`

  // Replace the section
  return content.slice(0, section.startOffset) + newContent + content.slice(section.endOffset)
}

/**
 * Append content to a section
 */
export function appendToSection(content: string, heading: string, appendContent: string): string {
  const section = getSection(content, heading)
  if (!section) {
    throw new Error(`Section "${heading}" not found`)
  }

  // Insert before the end of the section
  const insertOffset = section.endOffset
  return content.slice(0, insertOffset) + '\n' + appendContent + content.slice(insertOffset)
}

/**
 * Insert a new section after a given section
 */
export function insertSectionAfter(
  content: string,
  afterHeading: string,
  newHeading: string,
  newContent: string,
  level = 2
): string {
  const section = getSection(content, afterHeading)
  if (!section) {
    throw new Error(`Section "${afterHeading}" not found`)
  }

  const headingPrefix = '#'.repeat(level)
  const newSection = `\n\n${headingPrefix} ${newHeading}\n\n${newContent.trim()}`

  return content.slice(0, section.endOffset) + newSection + content.slice(section.endOffset)
}

/**
 * Delete a section
 */
export function deleteSection(content: string, heading: string): string {
  const section = getSection(content, heading)
  if (!section) {
    throw new Error(`Section "${heading}" not found`)
  }

  return content.slice(0, section.startOffset) + content.slice(section.endOffset)
}

/**
 * Get sections affected by a line range change
 */
export function getAffectedSections(content: string, startLine: number, endLine: number): string[] {
  const sections = parseSections(content)
  const affected: string[] = []

  for (const section of sections) {
    // Check if the line range overlaps with this section
    if (startLine <= section.endLine && endLine >= section.startLine) {
      affected.push(section.heading)
    }
  }

  return affected
}

/**
 * Parse context markers from content
 */
export function parseContextMarkers(
  content: string
): Map<string, 'always' | 'if-relevant' | 'priority' | 'human-only'> {
  const markers = new Map<string, 'always' | 'if-relevant' | 'priority' | 'human-only'>()
  const sections = parseSections(content)

  for (const section of sections) {
    if (section.content.includes('<!-- context: always -->')) {
      markers.set(section.heading, 'always')
    } else if (section.content.includes('<!-- context: if-relevant -->')) {
      markers.set(section.heading, 'if-relevant')
    } else if (section.content.includes('<!-- context: priority -->')) {
      markers.set(section.heading, 'priority')
    } else if (section.content.includes('<!-- context: human-only -->')) {
      markers.set(section.heading, 'human-only')
    }
  }

  return markers
}

/**
 * Get sections suitable for agent context (excluding human-only)
 */
export function getAgentContextSections(content: string): Section[] {
  const sections = parseSections(content)
  const markers = parseContextMarkers(content)

  return sections.filter((section) => {
    const marker = markers.get(section.heading)
    return marker !== 'human-only'
  })
}

/**
 * Get priority sections for limited context
 */
export function getPrioritySections(content: string): Section[] {
  const sections = parseSections(content)
  const markers = parseContextMarkers(content)

  return sections.filter((section) => {
    const marker = markers.get(section.heading)
    return marker === 'always' || marker === 'priority'
  })
}
