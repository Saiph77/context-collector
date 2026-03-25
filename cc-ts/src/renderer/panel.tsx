import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface PanelState {
  title: string;
  content: string;
}

type PreviewKind = 'markdown' | 'text' | 'unsupported';
type CenterMode = 'clipboard' | 'preview';

interface ExplorerNode {
  name: string;
  path: string;
  kind: 'directory' | 'file';
  previewKind?: PreviewKind;
  children?: ExplorerNode[];
}

interface PreviewState {
  path: string;
  previewKind: PreviewKind;
  content: string;
  loading: boolean;
  error: string | null;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: string;
}

function nodeContainsPath(nodes: ExplorerNode[], targetPath: string): boolean {
  for (const node of nodes) {
    if (node.path === targetPath) {
      return true;
    }
    if (node.kind === 'directory' && node.children && nodeContainsPath(node.children, targetPath)) {
      return true;
    }
  }
  return false;
}

function basename(value: string): string {
  const normalized = value.replace(/\\/g, '/');
  const pieces = normalized.split('/');
  return pieces[pieces.length - 1] || value;
}

function formatClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '--:--';
  }

  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function Panel(): JSX.Element {
  const [state, setState] = useState<PanelState>({
    title: 'untitled',
    content: '',
  });
  const [lastSaved, setLastSaved] = useState<string>('(not saved yet)');

  const [storageBaseDir, setStorageBaseDir] = useState<string>('');
  const [storagePathInput, setStoragePathInput] = useState<string>('');
  const [defaultProjectName, setDefaultProjectName] = useState<string>('demo-temp');
  const [explorerNodes, setExplorerNodes] = useState<ExplorerNode[]>([]);
  const [explorerError, setExplorerError] = useState<string | null>(null);
  const [explorerLoading, setExplorerLoading] = useState<boolean>(false);
  const [storagePathSaving, setStoragePathSaving] = useState<boolean>(false);

  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [previewState, setPreviewState] = useState<PreviewState | null>(null);

  const [isLeftSidebarVisible, setIsLeftSidebarVisible] = useState<boolean>(false);
  const [isRightSidebarVisible, setIsRightSidebarVisible] = useState<boolean>(true);
  const [centerMode, setCenterMode] = useState<CenterMode>('clipboard');

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'agent',
      content: 'Agent panel is ready. Send a message to test context handoff from the center preview.',
      timestamp: new Date().toISOString(),
    },
  ]);
  const [chatInput, setChatInput] = useState<string>('');
  const [chatSending, setChatSending] = useState<boolean>(false);

  const titleInputRef = useRef<HTMLInputElement>(null);
  const selectedFilePathRef = useRef<string | null>(null);
  const chatLogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    selectedFilePathRef.current = selectedFilePath;
  }, [selectedFilePath]);

  useEffect(() => {
    const chatLog = chatLogRef.current;
    if (!chatLog) {
      return;
    }
    chatLog.scrollTop = chatLog.scrollHeight;
  }, [chatMessages]);

  const refreshExplorer = useCallback(async () => {
    setExplorerLoading(true);
    setExplorerError(null);

    try {
      const payload = await window.ccApi.listFiles();
      setStorageBaseDir(payload.baseDir);
      setStoragePathInput(payload.baseDir);
      setDefaultProjectName(payload.defaultProjectName);
      setExplorerNodes(payload.nodes);

      setExpandedPaths((prev) => {
        const next = new Set(prev);
        for (const node of payload.nodes) {
          if (node.kind === 'directory') {
            next.add(node.path);
          }
        }
        return next;
      });

      if (selectedFilePathRef.current && !nodeContainsPath(payload.nodes, selectedFilePathRef.current)) {
        setSelectedFilePath(null);
        setPreviewState(null);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load file explorer.';
      setExplorerError(message);
    } finally {
      setExplorerLoading(false);
    }
  }, []);

  const loadFilePreview = useCallback(async (filePath: string) => {
    setCenterMode('preview');
    setSelectedFilePath(filePath);
    setPreviewState({
      path: filePath,
      previewKind: 'text',
      content: '',
      loading: true,
      error: null,
    });

    try {
      const payload = await window.ccApi.readFile(filePath);
      setPreviewState({
        path: payload.path,
        previewKind: payload.previewKind,
        content: payload.content,
        loading: false,
        error: null,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to read file.';
      setPreviewState({
        path: filePath,
        previewKind: 'unsupported',
        content: '',
        loading: false,
        error: message,
      });
    }
  }, []);

  const onApplyStoragePath = useCallback(async () => {
    const nextPath = storagePathInput.trim();
    if (!nextPath || storagePathSaving) {
      return;
    }

    setExplorerError(null);
    setStoragePathSaving(true);

    try {
      const payload = await window.ccApi.updateStorageBaseDir(nextPath);
      setStorageBaseDir(payload.baseDir);
      setStoragePathInput(payload.baseDir);
      setDefaultProjectName(payload.defaultProjectName);
      setExplorerNodes(payload.nodes);
      setExpandedPaths(() => {
        const expanded = new Set<string>();
        for (const node of payload.nodes) {
          if (node.kind === 'directory') {
            expanded.add(node.path);
          }
        }
        return expanded;
      });
      setSelectedFilePath(null);
      setPreviewState(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update storage path.';
      setExplorerError(message);
    } finally {
      setStoragePathSaving(false);
    }
  }, [storagePathInput, storagePathSaving]);

  const onSubmitChat = useCallback(async () => {
    const message = chatInput.trim();
    if (!message || chatSending) {
      return;
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    };

    setChatMessages((prev) => [...prev, userMessage]);
    setChatInput('');
    setChatSending(true);

    const contextFiles =
      previewState && selectedFilePath && !previewState.loading && !previewState.error
        ? [
            {
              path: selectedFilePath,
              content: previewState.content,
              previewKind: previewState.previewKind,
            },
          ]
        : [];

    // Create placeholder agent message for streaming
    const agentMessageId = `agent-${Date.now()}`;
    const agentMessage: ChatMessage = {
      id: agentMessageId,
      role: 'agent',
      content: '',
      timestamp: new Date().toISOString(),
    };

    setChatMessages((prev) => [...prev, agentMessage]);

    // Set up stream chunk listener
    const unsubscribe = window.ccApi.onAgentStreamChunk((chunk) => {
      if (chunk.type === 'chunk' && chunk.content) {
        setChatMessages((prev) =>
          prev.map((msg) =>
            msg.id === agentMessageId
              ? { ...msg, content: msg.content + chunk.content }
              : msg,
          ),
        );
      } else if (chunk.type === 'done') {
        setChatMessages((prev) =>
          prev.map((msg) =>
            msg.id === agentMessageId
              ? { ...msg, timestamp: chunk.timestamp || new Date().toISOString() }
              : msg,
          ),
        );
        setChatSending(false);
        unsubscribe();
      } else if (chunk.type === 'error') {
        setChatMessages((prev) =>
          prev.map((msg) =>
            msg.id === agentMessageId
              ? { ...msg, content: `Error: ${chunk.message || 'Unknown error'}` }
              : msg,
          ),
        );
        setChatSending(false);
        unsubscribe();
      }
    });

    try {
      await window.ccApi.sendAgentMessageStream(
        {
          message,
          contextFiles,
        },
      );
    } catch (error) {
      const fallback = error instanceof Error ? error.message : 'Unknown error';
      setChatMessages((prev) =>
        prev.map((msg) =>
          msg.id === agentMessageId
            ? { ...msg, content: `Failed to connect to agent server: ${fallback}` }
            : msg,
        ),
      );
      setChatSending(false);
      unsubscribe();
    }
  }, [chatInput, chatSending, previewState, selectedFilePath]);

  useEffect(() => {
    const unsubscribePresent = window.ccApi.onPresent(({ text }) => {
      setState({ title: 'untitled', content: text });
      window.ccApi.sendStateUpdate({ title: 'untitled', content: text });
      setCenterMode('clipboard');
      setIsLeftSidebarVisible(false);
      setIsRightSidebarVisible(true);
    });

    const unsubscribeFocus = window.ccApi.onFocusTitle(() => {
      const input = titleInputRef.current;
      if (!input) {
        return;
      }
      input.focus();
      input.select();
    });

    const unsubscribeSaved = window.ccApi.onSaved(({ path }) => {
      setLastSaved(path);
      void refreshExplorer();
      void loadFilePreview(path);
    });

    void refreshExplorer();

    return () => {
      unsubscribePresent();
      unsubscribeFocus();
      unsubscribeSaved();
    };
  }, [refreshExplorer, loadFilePreview]);

  useEffect(() => {
    window.ccApi.sendStateUpdate(state);
  }, [state]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!event.metaKey) {
        return;
      }

      const code = event.code;
      if (code === 'KeyS') {
        event.preventDefault();
        window.ccApi.requestSave();
        return;
      }

      if (code === 'KeyW') {
        event.preventDefault();
        window.ccApi.requestClose();
        return;
      }

      if (code === 'KeyB') {
        event.preventDefault();
        if (event.altKey) {
          setIsRightSidebarVisible((prev) => !prev);
          return;
        }
        setIsLeftSidebarVisible((prev) => !prev);
        setCenterMode('preview');
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const selectedFileName = useMemo(() => {
    if (!selectedFilePath) {
      return '(no file selected)';
    }
    return basename(selectedFilePath);
  }, [selectedFilePath]);

  const renderExplorerNodes = (nodes: ExplorerNode[], depth = 0): JSX.Element[] => {
    return nodes.flatMap((node) => {
      const paddingLeft = 10 + depth * 14;

      if (node.kind === 'directory') {
        const expanded = expandedPaths.has(node.path);
        const children = expanded && node.children ? renderExplorerNodes(node.children, depth + 1) : [];

        return [
          <button
            key={node.path}
            className="tree-row tree-dir"
            style={{ paddingLeft }}
            onClick={() => {
              setExpandedPaths((prev) => {
                const next = new Set(prev);
                if (next.has(node.path)) {
                  next.delete(node.path);
                } else {
                  next.add(node.path);
                }
                return next;
              });
            }}
          >
            <span className="tree-icon">{expanded ? '▾' : '▸'}</span>
            <span className="tree-name">{node.name}</span>
          </button>,
          ...children,
        ];
      }

      const previewTag = node.previewKind === 'unsupported' ? <span className="preview-tag">unsupported</span> : null;

      return [
        <button
          key={node.path}
          className={`tree-row tree-file ${selectedFilePath === node.path ? 'active' : ''}`}
          style={{ paddingLeft }}
          onClick={() => {
            void loadFilePreview(node.path);
          }}
        >
          <span className="tree-icon">•</span>
          <span className="tree-name">{node.name}</span>
          {previewTag}
        </button>,
      ];
    });
  };

  const previewBody = useMemo(() => {
    if (!selectedFilePath) {
      return (
        <div className="preview-empty">
          <p>Select a file from the left explorer to preview it here.</p>
          <p>Current supported types: `.md` and `.txt`.</p>
        </div>
      );
    }

    if (!previewState || previewState.loading) {
      return <div className="preview-empty">Loading preview...</div>;
    }

    if (previewState.error) {
      return <div className="preview-empty">{previewState.error}</div>;
    }

    if (previewState.previewKind === 'unsupported') {
      return (
        <div className="preview-empty">
          Unsupported preview type. Future adapters can render this file in the same panel.
        </div>
      );
    }

    return <pre className="preview-content">{previewState.content}</pre>;
  }, [selectedFilePath, previewState]);

  return (
    <div className="panel-shell">
      <div className="workbench">
        {isLeftSidebarVisible ? (
          <aside className="sidebar left-sidebar">
            <div className="sidebar-header">
              <h2>Explorer</h2>
              <button className="mini-btn" onClick={() => void refreshExplorer()}>
                Refresh
              </button>
            </div>
            <p className="sidebar-meta">Default path</p>
            <p className="sidebar-path">{storageBaseDir || '(loading...)'}</p>
            <div className="path-editor">
              <input
                className="input path-input"
                value={storagePathInput}
                onChange={(event) => setStoragePathInput(event.target.value)}
                placeholder="Set storage base directory..."
              />
              <button className="mini-btn" onClick={() => void onApplyStoragePath()} disabled={storagePathSaving}>
                {storagePathSaving ? 'Saving...' : 'Apply'}
              </button>
            </div>
            <p className="sidebar-meta">Project: {defaultProjectName}</p>
            {explorerLoading ? <p className="sidebar-note">Loading...</p> : null}
            {explorerError ? <p className="sidebar-note error">{explorerError}</p> : null}
            <div className="tree">{renderExplorerNodes(explorerNodes)}</div>
          </aside>
        ) : null}

        <main className="center-pane">
          <section className="center-card">
            <div className="row header-row">
              <h2>{centerMode === 'clipboard' ? 'Clipboard' : 'File Preview'}</h2>
              <div className="row mode-switch">
                <button
                  className={`mini-btn mode-btn ${centerMode === 'clipboard' ? 'active' : ''}`}
                  onClick={() => setCenterMode('clipboard')}
                >
                  Clipboard
                </button>
                <button
                  className={`mini-btn mode-btn ${centerMode === 'preview' ? 'active' : ''}`}
                  onClick={() => setCenterMode('preview')}
                >
                  Preview
                </button>
              </div>
            </div>

            <div className="center-content">
              {centerMode === 'clipboard' ? (
                <div className="clipboard-view">
                  <div className="grid">
                    <div className="label">Title</div>
                    <input
                      ref={titleInputRef}
                      className="input"
                      value={state.title}
                      onChange={(event) => setState((prev) => ({ ...prev, title: event.target.value }))}
                    />

                    <div className="label">Project</div>
                    <div>{defaultProjectName}</div>
                  </div>

                  <textarea
                    className="editor"
                    value={state.content}
                    onChange={(event) => setState((prev) => ({ ...prev, content: event.target.value }))}
                  />

                  <div>
                    <p className="meta-title">Last saved</p>
                    <p className="meta-path">{lastSaved}</p>
                  </div>
                </div>
              ) : (
                <div className="preview-view">
                  <span className="selected-file">{selectedFileName}</span>
                  {previewBody}
                </div>
              )}
            </div>

            <div className="row bottom-actions">
              <button className="btn" onClick={() => window.ccApi.requestClose()}>
                Close (Cmd+W)
              </button>
              <button className="btn primary" onClick={() => window.ccApi.requestSave()}>
                Save (Cmd+S)
              </button>
            </div>
          </section>
        </main>

        {isRightSidebarVisible ? (
          <aside className="sidebar right-sidebar">
            <div className="sidebar-header">
              <h2>Agent Chat</h2>
            </div>

            <div className="chat-log" ref={chatLogRef}>
              {chatMessages.map((message) => (
                <div key={message.id} className={`chat-item ${message.role}`}>
                  <div className="chat-meta">
                    <span>{message.role}</span>
                    <span>{formatClock(message.timestamp)}</span>
                  </div>
                  <div className="chat-content">{message.content}</div>
                </div>
              ))}
            </div>

            <form
              className="chat-input-row"
              onSubmit={(event) => {
                event.preventDefault();
                void onSubmitChat();
              }}
            >
              <textarea
                className="chat-input"
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                placeholder="Message agent..."
              />
              <button className="btn primary" type="submit" disabled={chatSending}>
                {chatSending ? 'Sending...' : 'Send'}
              </button>
            </form>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
