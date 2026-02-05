import { describe, it, expect } from 'vitest'
import {
  parseFrontmatter,
  parseSections,
  getSection,
  getSectionHeadings,
  updateSection,
  appendToSection,
  insertSectionAfter,
  deleteSection,
  getAffectedSections,
  parseContextMarkers,
  getAgentContextSections,
  getPrioritySections,
} from '../sections'

const SAMPLE_MD = `# Introduction

Welcome to the guide.

## Getting Started

Follow these steps to begin.

## Configuration

Set up your environment.

### Advanced Config

For power users.

## Conclusion

That's all.`

describe('sections', () => {
  describe('parseFrontmatter', () => {
    it('parses simple key-value frontmatter', () => {
      const content = '---\ntitle: My Doc\nauthor: Alice\n---\n# Body'
      const fm = parseFrontmatter(content)
      expect(fm).not.toBeNull()
      expect(fm!.data.title).toBe('My Doc')
      expect(fm!.data.author).toBe('Alice')
    })

    it('returns null when no frontmatter', () => {
      expect(parseFrontmatter('# Just a heading')).toBeNull()
      expect(parseFrontmatter('Plain text')).toBeNull()
    })

    it('parses boolean values', () => {
      const content = '---\ndraft: true\npublished: false\n---'
      const fm = parseFrontmatter(content)
      expect(fm!.data.draft).toBe(true)
      expect(fm!.data.published).toBe(false)
    })

    it('parses numeric values', () => {
      const content = '---\nversion: 42\nweight: 3.14\n---'
      const fm = parseFrontmatter(content)
      expect(fm!.data.version).toBe(42)
      expect(fm!.data.weight).toBe(3.14)
    })

    it('parses JSON arrays', () => {
      const content = '---\ntags: ["a","b","c"]\n---'
      const fm = parseFrontmatter(content)
      expect(fm!.data.tags).toEqual(['a', 'b', 'c'])
    })

    it('parses JSON objects', () => {
      const content = '---\nmeta: {"key":"value"}\n---'
      const fm = parseFrontmatter(content)
      expect(fm!.data.meta).toEqual({ key: 'value' })
    })

    it('keeps invalid JSON as string', () => {
      const content = '---\nbad: [not valid json\n---'
      const fm = parseFrontmatter(content)
      expect(fm!.data.bad).toBe('[not valid json')
    })

    it('has correct line numbers', () => {
      const content = '---\ntitle: Test\n---\n# Body'
      const fm = parseFrontmatter(content)
      expect(fm!.startLine).toBe(1)
      expect(fm!.endLine).toBe(3)
    })

    it('has correct offsets', () => {
      const content = '---\ntitle: Test\n---\n# Body'
      const fm = parseFrontmatter(content)
      expect(fm!.startOffset).toBe(0)
      expect(fm!.endOffset).toBe('---\ntitle: Test\n---'.length)
    })

    it('returns raw frontmatter string', () => {
      const content = '---\ntitle: Test\nauthor: Bob\n---'
      const fm = parseFrontmatter(content)
      expect(fm!.raw).toBe('title: Test\nauthor: Bob')
    })
  })

  describe('parseSections', () => {
    it('parses all sections from markdown', () => {
      const sections = parseSections(SAMPLE_MD)
      expect(sections).toHaveLength(5)
    })

    it('captures heading text without # prefix', () => {
      const sections = parseSections(SAMPLE_MD)
      expect(sections[0]!.heading).toBe('Introduction')
      expect(sections[1]!.heading).toBe('Getting Started')
    })

    it('captures heading levels', () => {
      const sections = parseSections(SAMPLE_MD)
      expect(sections[0]!.level).toBe(1) // #
      expect(sections[1]!.level).toBe(2) // ##
      expect(sections[3]!.level).toBe(3) // ###
    })

    it('captures line numbers', () => {
      const sections = parseSections(SAMPLE_MD)
      expect(sections[0]!.startLine).toBe(1) // # Introduction
    })

    it('section content includes the heading', () => {
      const sections = parseSections(SAMPLE_MD)
      expect(sections[0]!.content).toContain('# Introduction')
      expect(sections[0]!.content).toContain('Welcome to the guide.')
    })

    it('returns empty array for content without headings', () => {
      expect(parseSections('Plain text without headings')).toHaveLength(0)
    })

    it('handles single section', () => {
      const sections = parseSections('# Only Section\n\nContent here.')
      expect(sections).toHaveLength(1)
      expect(sections[0]!.heading).toBe('Only Section')
    })
  })

  describe('getSection', () => {
    it('finds section by heading (case-insensitive)', () => {
      const section = getSection(SAMPLE_MD, 'introduction')
      expect(section).not.toBeNull()
      expect(section!.heading).toBe('Introduction')
    })

    it('finds section with exact case', () => {
      const section = getSection(SAMPLE_MD, 'Getting Started')
      expect(section).not.toBeNull()
    })

    it('returns null for non-existent section', () => {
      expect(getSection(SAMPLE_MD, 'Nonexistent')).toBeNull()
    })
  })

  describe('getSectionHeadings', () => {
    it('returns all headings', () => {
      const headings = getSectionHeadings(SAMPLE_MD)
      expect(headings).toEqual([
        'Introduction',
        'Getting Started',
        'Configuration',
        'Advanced Config',
        'Conclusion',
      ])
    })

    it('returns empty array for no headings', () => {
      expect(getSectionHeadings('No headings here')).toEqual([])
    })
  })

  describe('updateSection', () => {
    it('replaces section content while preserving heading', () => {
      const result = updateSection(SAMPLE_MD, 'Introduction', 'New introduction text.')
      expect(result).toContain('# Introduction')
      expect(result).toContain('New introduction text.')
      expect(result).not.toContain('Welcome to the guide.')
    })

    it('preserves other sections', () => {
      const result = updateSection(SAMPLE_MD, 'Introduction', 'Updated.')
      expect(result).toContain('## Getting Started')
      expect(result).toContain('## Conclusion')
    })

    it('throws for non-existent section', () => {
      expect(() => updateSection(SAMPLE_MD, 'Nonexistent', 'content')).toThrow(
        'Section "Nonexistent" not found'
      )
    })
  })

  describe('appendToSection', () => {
    it('appends content to section end', () => {
      const result = appendToSection(SAMPLE_MD, 'Introduction', 'Appended text.')
      expect(result).toContain('Welcome to the guide.')
      expect(result).toContain('Appended text.')
    })

    it('throws for non-existent section', () => {
      expect(() => appendToSection(SAMPLE_MD, 'Nonexistent', 'content')).toThrow(
        'Section "Nonexistent" not found'
      )
    })
  })

  describe('insertSectionAfter', () => {
    it('inserts new section after specified section', () => {
      const result = insertSectionAfter(
        SAMPLE_MD,
        'Introduction',
        'Prerequisites',
        'You need Node.js installed.'
      )
      expect(result).toContain('## Prerequisites')
      expect(result).toContain('You need Node.js installed.')
      // Should appear between Introduction and Getting Started
      const prereqIdx = result.indexOf('## Prerequisites')
      const introIdx = result.indexOf('# Introduction')
      const gettingIdx = result.indexOf('## Getting Started')
      expect(prereqIdx).toBeGreaterThan(introIdx)
      expect(prereqIdx).toBeLessThan(gettingIdx)
    })

    it('uses custom heading level', () => {
      const result = insertSectionAfter(
        SAMPLE_MD,
        'Introduction',
        'Sub',
        'Content',
        3
      )
      expect(result).toContain('### Sub')
    })

    it('throws for non-existent after section', () => {
      expect(() =>
        insertSectionAfter(SAMPLE_MD, 'Nonexistent', 'New', 'Content')
      ).toThrow('Section "Nonexistent" not found')
    })
  })

  describe('deleteSection', () => {
    it('removes section entirely', () => {
      const result = deleteSection(SAMPLE_MD, 'Getting Started')
      expect(result).not.toContain('Getting Started')
      expect(result).not.toContain('Follow these steps')
      // Other sections should remain
      expect(result).toContain('Introduction')
      expect(result).toContain('Configuration')
    })

    it('throws for non-existent section', () => {
      expect(() => deleteSection(SAMPLE_MD, 'Nonexistent')).toThrow(
        'Section "Nonexistent" not found'
      )
    })
  })

  describe('getAffectedSections', () => {
    it('returns sections overlapping with line range', () => {
      const affected = getAffectedSections(SAMPLE_MD, 1, 3)
      expect(affected).toContain('Introduction')
    })

    it('returns multiple sections for wide range', () => {
      const affected = getAffectedSections(SAMPLE_MD, 1, 100)
      expect(affected.length).toBeGreaterThan(1)
    })

    it('returns empty for range with no sections', () => {
      const affected = getAffectedSections('No headings\njust text', 1, 2)
      expect(affected).toHaveLength(0)
    })
  })

  describe('parseContextMarkers', () => {
    it('parses context markers from sections', () => {
      const content = `# Always Section
<!-- context: always -->
Important info.

# Optional Section
<!-- context: if-relevant -->
Optional info.

# Priority Section
<!-- context: priority -->
High priority.

# Human Section
<!-- context: human-only -->
For humans only.`

      const markers = parseContextMarkers(content)
      expect(markers.get('Always Section')).toBe('always')
      expect(markers.get('Optional Section')).toBe('if-relevant')
      expect(markers.get('Priority Section')).toBe('priority')
      expect(markers.get('Human Section')).toBe('human-only')
    })

    it('returns empty map for content without markers', () => {
      const markers = parseContextMarkers(SAMPLE_MD)
      expect(markers.size).toBe(0)
    })
  })

  describe('getAgentContextSections', () => {
    it('excludes human-only sections', () => {
      const content = `# Public
Content.

# Private
<!-- context: human-only -->
Secret.

# Also Public
More content.`

      const sections = getAgentContextSections(content)
      const headings = sections.map((s) => s.heading)
      expect(headings).toContain('Public')
      expect(headings).toContain('Also Public')
      expect(headings).not.toContain('Private')
    })

    it('includes sections without markers', () => {
      const sections = getAgentContextSections(SAMPLE_MD)
      expect(sections.length).toBe(5) // All sections (no markers)
    })
  })

  describe('getPrioritySections', () => {
    it('returns only always and priority sections', () => {
      const content = `# Required
<!-- context: always -->
Always included.

# Important
<!-- context: priority -->
High priority.

# Optional
<!-- context: if-relevant -->
Maybe included.

# Normal
Just normal content.`

      const sections = getPrioritySections(content)
      const headings = sections.map((s) => s.heading)
      expect(headings).toContain('Required')
      expect(headings).toContain('Important')
      expect(headings).not.toContain('Optional')
      expect(headings).not.toContain('Normal')
    })

    it('returns empty for content without priority markers', () => {
      const sections = getPrioritySections(SAMPLE_MD)
      expect(sections).toHaveLength(0)
    })
  })
})
