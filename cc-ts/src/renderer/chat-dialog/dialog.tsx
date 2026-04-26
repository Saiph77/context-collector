import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  streaming?: boolean;
}

interface ChatState {
  messages: ChatMessage[];
  attachmentCount: number;
  sending: boolean;
  currentSessionId: string | null;
  readonlyHistorySessionId: string | null;
}

const EMPTY_STATE: ChatState = {
  messages: [],
  attachmentCount: 0,
  sending: false,
  currentSessionId: null,
  readonlyHistorySessionId: null,
};

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

function Dialog(): JSX.Element {
  const [state, setState] = useState<ChatState>(EMPTY_STATE);

  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;

    void window.visionApi.getChatState().then((payload) => {
      if (mounted) {
        setState(payload as ChatState);
      }
    });

    const unsubscribe = window.visionApi.onChatState((payload) => {
      setState(payload as ChatState);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const node = logRef.current;
    if (!node) {
      return;
    }
    node.scrollTop = node.scrollHeight;
  }, [state.messages]);

  const titleText = useMemo(() => {
    return `临时对话 (${state.attachmentCount} 个附件上下文)`;
  }, [state.attachmentCount]);

  const isReadonlyHistory = state.readonlyHistorySessionId !== null;

  return (
    <div className="dialog-shell">
      <div className="dialog-header">
        <h2>{titleText}</h2>
        <button className="ghost-btn" onClick={() => void window.visionApi.closeChatWindow()}>
          收起
        </button>
      </div>

      {isReadonlyHistory ? (
        <div className="readonly-banner">
          当前是历史会话只读模式（{state.readonlyHistorySessionId?.slice(0, 18)}），请在下方 bar 中退出历史或开启新会话。
        </div>
      ) : null}

      <div className="chat-log" ref={logRef}>
        {state.messages.length === 0 ? (
          <div className="empty">在下方输入框发送消息，这里会展示流式对话记录。</div>
        ) : (
          state.messages.map((message) => (
            <div key={message.id} className={`message ${message.role}`}>
              <div className="meta">
                <span>{message.role === 'user' ? '你' : 'AI'}</span>
                <span>{formatClock(message.timestamp)}</span>
              </div>
              <div className="content">{message.content || (message.streaming ? '...' : '')}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Missing #root container for chat dialog');
}

createRoot(rootEl).render(<Dialog />);
