import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import './MarvinSidebar.css';

type MarvinMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
};

type MarvinSidebarProps = {
  locationHint?: string | null;
};

const scenarioApiBaseUrl = import.meta.env.VITE_SCENARIO_API_URL ?? '';
const buildApiUrl = (path: string): string => (scenarioApiBaseUrl ? `${scenarioApiBaseUrl}${path}` : path);

const createMessageId = (): string => {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
  }
};

const initialMessage: MarvinMessage = {
  id: 'marvin-intro',
  role: 'assistant',
  content:
    'Hi, I am Marvin. Ask me about CMHC rent data, vacancy trends, StatsCan demographics, or how MLI Select assumptions might work for your project.',
};

const MarvinSidebar = ({ locationHint }: MarvinSidebarProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MarvinMessage[]>([initialMessage]);
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const container = scrollContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages, isOpen]);

  const canSend = useMemo(() => {
    return Boolean(inputValue.trim()) && !isSending;
  }, [inputValue, isSending]);

  const handleToggle = () => {
    setIsOpen((prev) => !prev);
    setError(null);
  };

  const handleSubmit = async () => {
    const trimmed = inputValue.trim();
    if (!trimmed || isSending) {
      return;
    }
    const pendingMessage: MarvinMessage = {
      id: createMessageId(),
      role: 'user',
      content: trimmed,
    };
    setMessages((prev) => [...prev, pendingMessage]);
    setInputValue('');
    setIsSending(true);
    setError(null);

    try {
      const response = await fetch(buildApiUrl('/api/marvin/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          conversation_id: conversationId,
          metadata: { location: locationHint ?? null },
        }),
      });
      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(errorText || 'Request failed');
      }
      const payload = (await response.json()) as { reply?: string; conversation_id?: string };
      const reply = payload.reply?.trim();
      if (!reply) {
        throw new Error('Marvin did not return a response.');
      }
      setConversationId(payload.conversation_id ?? conversationId ?? null);
      setMessages((prev) => [
        ...prev,
        {
          id: createMessageId(),
          role: 'assistant',
          content: reply,
        },
      ]);
    } catch (error_) {
      const fallbackMessage = error_ instanceof Error ? error_.message : 'Something went wrong';
      setError(fallbackMessage);
      setMessages((prev) => [
        ...prev,
        {
          id: createMessageId(),
          role: 'system',
          content: 'Unable to reach Marvin right now. Please try again shortly.',
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  };

  return (
    <>
      <button
        type="button"
        className="marvin-launcher"
        onClick={handleToggle}
        aria-expanded={isOpen}
        aria-controls="marvin-sidebar"
      >
        Ask Marvin
      </button>
      <aside id="marvin-sidebar" className={`marvin-sidebar${isOpen ? ' open' : ''}`} aria-hidden={!isOpen}>
        <header className="marvin-sidebar__header">
          <div>
            <p className="marvin-title">Marvin</p>
            <p className="marvin-subtitle">CMHC & demographics assistant</p>
          </div>
          <button type="button" className="marvin-close" onClick={handleToggle} aria-label="Close Marvin chat">
            ×
          </button>
        </header>
        <div className="marvin-sidebar__body">
          <div className="marvin-messages" ref={scrollContainerRef}>
            {messages.map((message) => (
              <div key={message.id} className={`marvin-message marvin-message--${message.role}`}>
                <div className="marvin-message__bubble">{message.content}</div>
              </div>
            ))}
            {isSending && (
              <div className="marvin-message marvin-message--assistant">
                <div className="marvin-message__bubble marvin-message__bubble--ghost">Marvin is typing…</div>
              </div>
            )}
          </div>
          <form
            className="marvin-input-row"
            onSubmit={(event) => {
              event.preventDefault();
              handleSubmit();
            }}
          >
            <input
              ref={inputRef}
              type="text"
              className="marvin-input"
              placeholder="Ask about CMHC, StatsCan, or MLI Select…"
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isSending}
            />
            <button type="submit" className="marvin-send" disabled={!canSend}>
              Send
            </button>
          </form>
          {error && <p className="marvin-error">{error}</p>}
        </div>
      </aside>
    </>
  );
};

export default MarvinSidebar;
