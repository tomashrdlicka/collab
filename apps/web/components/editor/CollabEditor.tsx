'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { keymap } from '@codemirror/view'
import { defaultKeymap, indentWithTab } from '@codemirror/commands'
import * as Y from 'yjs'
import { yCollab } from 'y-codemirror.next'
import { WebsocketProvider } from 'y-websocket'
import { IndexeddbPersistence } from 'y-indexeddb'
import { getUserColor } from '@collab/sync'

interface CollabEditorProps {
  workspaceId: string
  documentPath: string
  userId: string
  userName: string
  readOnly?: boolean
}

export function CollabEditor({
  workspaceId,
  documentPath,
  userId,
  userName,
  readOnly = false,
}: CollabEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<EditorView | null>(null)
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')

  useEffect(() => {
    if (!containerRef.current) return

    // Create Yjs document
    const ydoc = new Y.Doc()
    const ytext = ydoc.getText('content')

    // Set up IndexedDB persistence for offline support
    const documentName = `${workspaceId}/${documentPath}`
    const indexeddbProvider = new IndexeddbPersistence(documentName, ydoc)

    indexeddbProvider.on('synced', () => {
      console.log('Loaded from IndexedDB')
    })

    // Set up WebSocket connection to sync server
    const wsUrl = process.env.NEXT_PUBLIC_HOCUSPOCUS_URL ?? 'ws://localhost:1234'
    const wsProvider = new WebsocketProvider(wsUrl, documentName, ydoc, {
      params: { token: userId },
    })

    wsProvider.on('status', (event: { status: string }) => {
      if (event.status === 'connected') {
        setStatus('connected')
      } else if (event.status === 'disconnected') {
        setStatus('disconnected')
      } else {
        setStatus('connecting')
      }
    })

    // Set up awareness (presence)
    const awareness = wsProvider.awareness
    awareness.setLocalStateField('user', {
      name: userName,
      color: getUserColor(userId),
      colorLight: getUserColor(userId) + '33', // Add alpha
    })

    // Create CodeMirror editor
    const state = EditorState.create({
      doc: ytext.toString(),
      extensions: [
        basicSetup,
        markdown(),
        keymap.of([...defaultKeymap, indentWithTab]),
        yCollab(ytext, awareness, { undoManager: new Y.UndoManager(ytext) }),
        EditorView.editable.of(!readOnly),
        EditorView.theme({
          '&': {
            height: '100%',
          },
          '.cm-scroller': {
            overflow: 'auto',
          },
        }),
      ],
    })

    const view = new EditorView({
      state,
      parent: containerRef.current,
    })

    editorRef.current = view

    // Cleanup
    return () => {
      view.destroy()
      wsProvider.disconnect()
      indexeddbProvider.destroy()
      ydoc.destroy()
    }
  }, [workspaceId, documentPath, userId, userName, readOnly])

  return (
    <div className="h-full flex flex-col">
      {/* Status bar */}
      <div className="h-6 px-2 border-b flex items-center justify-end text-xs">
        <div className={`sync-status ${status === 'connected' ? 'synced' : status === 'disconnected' ? 'offline' : 'syncing'}`}>
          <span className="dot" />
          <span>
            {status === 'connected' ? 'Connected' : status === 'disconnected' ? 'Offline' : 'Connecting...'}
          </span>
        </div>
      </div>

      {/* Editor container */}
      <div ref={containerRef} className="flex-1 overflow-hidden" />
    </div>
  )
}
