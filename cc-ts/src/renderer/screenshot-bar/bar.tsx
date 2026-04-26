import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';

interface AttachmentView {
  id: string;
  name: string;
  kind: 'image' | 'file';
  source: 'screenshot' | 'upload';
  mimeType: string;
  width?: number;
  height?: number;
  previewDataUrl: string | null;
}

interface TranscriptView {
  running: boolean;
  phase: 'idle' | 'uploading' | 'parsing' | 'streaming' | 'done' | 'error';
  progress: number;
  message: string;
  sessionPath?: string;
}

interface HistorySessionView {
  id: string;
  createdAt: string;
  updatedAt: string;
  interactionCount: number;
  attachmentCount: number;
  lastPrompt: string;
  lastStatus: 'pending' | 'success' | 'error' | 'none';
}

interface BarState {
  maxAttachments: number;
  attachments: AttachmentView[];
  transcript: TranscriptView;
  historySessions: HistorySessionView[];
  currentSessionId: string | null;
  readonlyHistorySessionId: string | null;
}

const DEFAULT_STATE: BarState = {
  maxAttachments: 9,
  attachments: [],
  transcript: {
    running: false,
    phase: 'idle',
    progress: 0,
    message: '',
  },
  historySessions: [],
  currentSessionId: null,
  readonlyHistorySessionId: null,
};

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '--:--';
  }
  return date.toLocaleString('zh-CN', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function VisionBar(): JSX.Element {
  const [state, setState] = useState<BarState>(DEFAULT_STATE);
  const [input, setInput] = useState<string>('');
  const [sending, setSending] = useState<boolean>(false);
  const [showHistory, setShowHistory] = useState<boolean>(false);

  useEffect(() => {
    let mounted = true;

    void window.visionApi.getState().then((payload) => {
      if (mounted) {
        setState(payload as BarState);
      }
    });

    const unsubscribe = window.visionApi.onState((payload) => {
      setState(payload as BarState);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const showProgress = state.transcript.running;

  const attachmentCountText = useMemo(() => {
    return `${state.attachments.length}/${state.maxAttachments}`;
  }, [state.attachments.length, state.maxAttachments]);

  const onSendChat = async (): Promise<void> => {
    const message = input.trim();
    if (!message || sending) {
      return;
    }

    setSending(true);
    try {
      await window.visionApi.sendChat(message);
      setInput('');
    } finally {
      setSending(false);
    }
  };

  const onTranscript = async (): Promise<void> => {
    await window.visionApi.requestTranscript(input.trim());
  };

  const renderHistoryStatus = (status: HistorySessionView['lastStatus']): string => {
    if (status === 'success') {
      return '成功';
    }
    if (status === 'error') {
      return '失败';
    }
    if (status === 'pending') {
      return '进行中';
    }
    return '空';
  };

  return (
    <div className="bar-shell">
      <div className="thumb-row">
        {state.attachments.map((attachment, index) => (
          <div className="thumb-card" key={attachment.id}>
            {attachment.kind === 'image' && attachment.previewDataUrl ? (
              <img src={attachment.previewDataUrl} className="thumb-image" alt={attachment.name} />
            ) : (
              <div className="thumb-file">{attachment.name.split('.').pop()?.toUpperCase() || 'FILE'}</div>
            )}
            <button
              className="thumb-remove"
              onClick={() => {
                void window.visionApi.removeAttachment(index);
              }}
            >
              ×
            </button>
          </div>
        ))}
        {state.attachments.length === 0 ? <div className="thumb-placeholder">拖拽截图后将显示在这里</div> : null}
      </div>

      <div className="input-row">
        <textarea
          className="message-input"
          placeholder="输入你的问题，Enter 发送到临时对话框..."
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onPaste={(event) => {
            const hasImage = Array.from(event.clipboardData?.items || []).some((item) =>
              item.type.startsWith('image/'),
            );
            if (!hasImage) {
              return;
            }
            event.preventDefault();
            void window.visionApi.pasteClipboardImage();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void onSendChat();
            }
          }}
        />
      </div>

      <div className="action-row">
        <div className="left-actions">
          <button
            className="flat-btn"
            onClick={() => {
              void window.visionApi.requestUploadFiles();
            }}
          >
            +
          </button>
          <button
            className="flat-btn transcript-btn"
            onClick={() => {
              void onTranscript();
            }}
            disabled={state.transcript.running}
          >
            transcript
          </button>
          <span className="count-tag">{attachmentCountText}</span>
          {state.readonlyHistorySessionId ? <span className="history-tag">历史只读</span> : null}
        </div>

        <div className="right-actions">
          <button
            className="flat-btn"
            onClick={() => {
              setShowHistory((prev) => !prev);
            }}
            title="历史会话"
          >
            history
          </button>
          <button
            className="flat-btn"
            onClick={() => {
              void window.visionApi.startNewSession();
            }}
            title="新会话"
          >
            new
          </button>
          <button
            className="flat-btn"
            onClick={() => {
              void window.visionApi.requestScreenshot();
            }}
            title="继续截图"
          >
            截图
          </button>
          <button className="send-btn" onClick={() => void onSendChat()} disabled={sending} title="发送聊天">
            ↑
          </button>
        </div>
      </div>

      {showHistory ? (
        <div className="history-panel">
          <div className="history-header">
            <span>历史会话（jsonl）</span>
            {state.readonlyHistorySessionId ? (
              <button
                className="ghost-mini"
                onClick={() => {
                  void window.visionApi.leaveHistorySession();
                }}
              >
                退出历史
              </button>
            ) : null}
          </div>
          <div className="history-list">
            {state.historySessions.length === 0 ? (
              <div className="history-empty">暂无历史会话</div>
            ) : (
              state.historySessions.map((session) => {
                const active = state.currentSessionId === session.id;
                return (
                  <button
                    key={session.id}
                    className={`history-item ${active ? 'active' : ''}`}
                    onClick={() => {
                      void window.visionApi.loadHistorySession(session.id);
                    }}
                  >
                    <div className="history-title-row">
                      <span className="history-id">{session.id.slice(0, 20)}</span>
                      <span className="history-status">{renderHistoryStatus(session.lastStatus)}</span>
                    </div>
                    <div className="history-meta">
                      <span>{formatTime(session.updatedAt)}</span>
                      <span>
                        对话 {session.interactionCount} | 附件 {session.attachmentCount}
                      </span>
                    </div>
                    <div className="history-prompt">{session.lastPrompt || '(无内容)'}</div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : null}

      {showProgress ? (
        <div className="progress-mini">
          <div className="progress-mini-track">
            <div
              className={`progress-mini-value ${state.transcript.phase === 'error' ? 'error' : ''}`}
              style={{ width: `${Math.min(100, Math.max(0, state.transcript.progress * 100))}%` }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Missing #root container for vision bar');
}

createRoot(rootEl).render(<VisionBar />);
