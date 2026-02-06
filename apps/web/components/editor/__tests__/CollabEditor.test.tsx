import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CollabEditor } from '../CollabEditor'

// Mock all external modules that CollabEditor depends on

// The component uses `import { EditorView, basicSetup } from 'codemirror'`
// and also `import { EditorView } from '@codemirror/view'`
// The latter overrides the former in the component code.

vi.mock('codemirror', () => {
  class MockEditorView {
    destroy = vi.fn()
    constructor(_config: unknown) {
      // noop
    }
    static editable = { of: vi.fn().mockReturnValue([]) }
    static theme = vi.fn().mockReturnValue([])
  }
  return {
    EditorView: MockEditorView,
    basicSetup: [],
  }
})

vi.mock('@codemirror/state', () => ({
  EditorState: {
    create: vi.fn().mockReturnValue({}),
  },
}))

vi.mock('@codemirror/lang-markdown', () => ({
  markdown: vi.fn().mockReturnValue([]),
}))

vi.mock('@codemirror/view', () => {
  class MockEditorView {
    destroy = vi.fn()
    constructor(_config: unknown) {
      // noop
    }
    static editable = { of: vi.fn().mockReturnValue([]) }
    static theme = vi.fn().mockReturnValue([])
  }
  return {
    EditorView: MockEditorView,
    keymap: { of: vi.fn().mockReturnValue([]) },
  }
})

vi.mock('@codemirror/commands', () => ({
  defaultKeymap: [],
  indentWithTab: {},
}))

vi.mock('yjs', () => {
  class MockDoc {
    getText = vi.fn().mockReturnValue({ toString: () => '' })
    destroy = vi.fn()
  }
  class MockUndoManager {
    constructor() {
      // noop
    }
  }
  return { Doc: MockDoc, UndoManager: MockUndoManager }
})

vi.mock('y-codemirror.next', () => ({
  yCollab: vi.fn().mockReturnValue([]),
}))

vi.mock('y-websocket', () => {
  class MockWebsocketProvider {
    awareness = { setLocalStateField: vi.fn() }
    on = vi.fn()
    disconnect = vi.fn()
    destroy = vi.fn()
    constructor() {
      // noop
    }
  }
  return { WebsocketProvider: MockWebsocketProvider }
})

vi.mock('y-indexeddb', () => {
  class MockIndexeddbPersistence {
    on = vi.fn()
    destroy = vi.fn()
    constructor() {
      // noop
    }
  }
  return { IndexeddbPersistence: MockIndexeddbPersistence }
})

vi.mock('@collab/sync', () => ({
  getUserColor: vi.fn().mockReturnValue('#ff0000'),
}))

describe('CollabEditor', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const defaultProps = {
    workspaceId: 'ws-1',
    documentPath: 'README.md',
    userId: 'user-1',
    userName: 'Test User',
  }

  it('renders the status bar with connecting state', () => {
    render(<CollabEditor {...defaultProps} />)
    expect(screen.getByText('Connecting...')).toBeInTheDocument()
  })

  it('renders the editor container div', () => {
    const { container } = render(<CollabEditor {...defaultProps} />)
    const editorContainer = container.querySelector('.flex-1.overflow-hidden')
    expect(editorContainer).toBeInTheDocument()
  })

  it('renders with readOnly prop', () => {
    render(<CollabEditor {...defaultProps} readOnly={true} />)
    expect(screen.getByText('Connecting...')).toBeInTheDocument()
  })

  it('has the status indicator dot', () => {
    const { container } = render(<CollabEditor {...defaultProps} />)
    const dot = container.querySelector('.dot')
    expect(dot).toBeInTheDocument()
  })

  it('has the sync-status container', () => {
    const { container } = render(<CollabEditor {...defaultProps} />)
    const syncStatus = container.querySelector('.sync-status')
    expect(syncStatus).toBeInTheDocument()
  })

  it('cleans up on unmount', () => {
    const { unmount } = render(<CollabEditor {...defaultProps} />)
    expect(() => unmount()).not.toThrow()
  })
})
