import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import './MaggiSidebar.css';
import maggiIcon from '../../maggi.png';
import maggiButtonImage from '../../maggib.png';

type MaggiMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
};

type MaggiSidebarMetadata = {
  location?: string | null;
  cmhcMetroCode?: string | null;
  cmhcMetroLabel?: string | null;
  postalCode?: string | null;
};

type MaggiSidebarProps = {
  locationHint?: string | null;
  metadata?: MaggiSidebarMetadata;
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

const normalizeMetadataValue = (value?: string | null): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const initialMessage: MaggiMessage = {
  id: 'maggi-intro',
  role: 'assistant',
  content:
    'Woof! I\'m Maggi, your feisty miniature schnauzer who doubles as a real estate nerd. Ask about CMHC rents, vacancy drama, StatsCan people stats, or how MLI Select treats your latest doghouse-sized high rise.',
};

const chatEndpoints = ['/api/maggi/chat', '/api/marvin/chat'];

const MaggiSidebar = ({ locationHint, metadata }: MaggiSidebarProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MaggiMessage[]>([initialMessage]);
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
    const pendingMessage: MaggiMessage = {
      id: createMessageId(),
      role: 'user',
      content: trimmed,
    };
    setMessages((prev) => [...prev, pendingMessage]);
    setInputValue('');
    setIsSending(true);
    setError(null);

    try {
      const payload = await (async () => {
        let lastError: Error | null = null;
        for (const path of chatEndpoints) {
          try {
            const response = await fetch(buildApiUrl(path), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                message: trimmed,
                conversation_id: conversationId,
                metadata: {
                  location: normalizeMetadataValue(metadata?.location ?? locationHint ?? null),
                  cmhc_metro_code: normalizeMetadataValue(metadata?.cmhcMetroCode ?? null),
                  cmhc_metro_label: normalizeMetadataValue(
                    metadata?.cmhcMetroLabel ?? metadata?.location ?? locationHint ?? null,
                  ),
                  postal_code: normalizeMetadataValue(metadata?.postalCode ?? null),
                },
              }),
            });
            if (response.status === 404) {
              continue;
            }
            if (!response.ok) {
              const errorText = await response.text().catch(() => '');
              throw new Error(errorText || 'Request failed');
            }
            return (await response.json()) as { reply?: string; conversation_id?: string };
          } catch (error) {
            if (error instanceof Error) {
              lastError = error;
            }
          }
        }
        if (lastError) {
          throw lastError;
        }
        throw new Error('Maggi could not reach the den.');
      })();
      const reply = payload.reply?.trim();
      if (!reply) {
        throw new Error('Maggi got distracted and forgot to reply.');
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
          content: 'Maggi is busy chasing cap rates—try again in a moment.',
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
        className="maggi-launcher"
        onClick={handleToggle}
        aria-expanded={isOpen}
        aria-controls="maggi-sidebar"
        aria-label="Ask Maggi"
      >
        <img src={maggiButtonImage} alt="Ask Maggi" className="maggi-launcher__image" />
        <span className="maggi-launcher__label">Ask Maggi</span>
      </button>
      <aside id="maggi-sidebar" className={`maggi-sidebar${isOpen ? ' open' : ''}`} aria-hidden={!isOpen}>
        <header className="maggi-sidebar__header">
          <div className="maggi-heading">
            <img src={maggiIcon} alt="Maggi the miniature schnauzer" className="maggi-avatar" />
            <div>
              <p className="maggi-title">Maggi</p>
              <p className="maggi-subtitle">Feisty schnauzer & CMHC whisperer</p>
            </div>
          </div>
          <button type="button" className="maggi-close" onClick={handleToggle} aria-label="Close Maggi chat">
            ×
          </button>
        </header>
        <div className="maggi-sidebar__body">
          <div className="maggi-messages" ref={scrollContainerRef}>
            {messages.map((message) => (
              <div key={message.id} className={`maggi-message maggi-message--${message.role}`}>
                <div className="maggi-message__bubble">{message.content}</div>
              </div>
            ))}
            {isSending && (
              <div className="maggi-message maggi-message--assistant">
                <div className="maggi-message__bubble maggi-message__bubble--ghost">Maggi is thinking…</div>
              </div>
            )}
          </div>
          <form
            className="maggi-input-row"
            onSubmit={(event) => {
              event.preventDefault();
              handleSubmit();
            }}
          >
            <input
              ref={inputRef}
              type="text"
              className="maggi-input"
              placeholder="Ask Maggi about CMHC, StatsCan, or MLI Select…"
              value={inputValue}
              onChange={(event) => setInputValue(event.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isSending}
            />
            <button type="submit" className="maggi-send" disabled={!canSend}>
              Send
            </button>
          </form>
          {error && <p className="maggi-error">{error}</p>}
        </div>
      </aside>
    </>
  );
};

export default MaggiSidebar;
