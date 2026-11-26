import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'

export interface ChatItem {
  id: number
  kind: 'user' | 'assistant' | 'action' | 'error' | 'download'
  text: string
  ok?: boolean
  /** Enlace http/https para abrir a mano (pestaña bloqueada). */
  url?: string
}

interface Props {
  items: ChatItem[]
  busy: boolean
  recording: boolean
  transcribing: boolean
  hasApiKey: boolean
  hotkeyHint: boolean
  suggestions?: string[]
  voiceInput?: boolean
  downloads?: { exe: string; apk: string | null }
  onSend: (text: string) => void
  onMic: () => void
  onOpenSettings: () => void
}

function safeUrl(u?: string): string | undefined {
  try {
    const p = new URL(u ?? '')
    return p.protocol === 'http:' || p.protocol === 'https:' ? p.href : undefined
  } catch {
    return undefined
  }
}

const SUGGESTIONS = [
  'Abre el último video de un canal que me guste',
  'Sube el volumen',
  'Recuérdame abrir Spotify mañana a las 8'
]

export function Chat(p: Props) {
  const [text, setText] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [p.items.length, p.busy])

  const submit = (e: FormEvent): void => {
    e.preventDefault()
    const t = text.trim()
    if (!t || p.busy) return
    setText('')
    p.onSend(t)
  }

  const placeholder = p.recording
    ? 'Escuchando… habla ahora'
    : p.transcribing
      ? 'Transcribiendo tu voz…'
      : p.hotkeyHint
        ? 'Escribe una orden o presiona Ctrl+Espacio para hablar'
        : 'Escribe una orden o toca el micrófono'

  return (
    <section className="chat" aria-label="Conversación">
      <div className="chat-scroll">
        <div className="chat-log" role="log" aria-live="polite">
          {!p.hasApiKey && (
            <div className="notice">
              <p>Falta tu API key de Gemini. Agrégala en Ajustes para empezar.</p>
              <button type="button" className="btn btn-primary" onClick={p.onOpenSettings}>
                Abrir Ajustes
              </button>
            </div>
          )}
          {p.items.length === 0 && (
            <div className="empty">
              <p className="empty-title">Dime qué necesitas.</p>
              <ul className="suggestions">
                {(p.suggestions ?? SUGGESTIONS).map((s) => (
                  <li key={s}>
                    <button type="button" className="link" disabled={p.busy} onClick={() => p.onSend(s)}>
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {p.items.map((m) =>
            m.kind === 'download' ? (
              <div key={m.id} className="msg msg-download">
                <a className="btn btn-primary" href={p.downloads?.exe} target="_blank" rel="noreferrer">
                  Descargar para Windows
                </a>
                {p.downloads?.apk ? (
                  <a className="btn" href={p.downloads.apk} download>
                    Descargar para Android
                  </a>
                ) : (
                  <span className="hint">Android: próximamente</span>
                )}
              </div>
            ) : (
            <div key={m.id} className={`msg msg-${m.kind}${m.kind === 'action' && m.ok === false ? ' is-failed' : ''}`}>
              {m.text}
              {m.kind === 'action' && m.ok === false && safeUrl(m.url) && (
                <a className="link" href={safeUrl(m.url)} target="_blank" rel="noopener noreferrer">
                  Abrir enlace
                </a>
              )}
            </div>
            )
          )}
          {p.busy && (
            <div className="msg msg-pending" aria-hidden="true">
              <span className="dots">
                <i />
                <i />
                <i />
              </span>
            </div>
          )}
          <div ref={endRef} />
        </div>
      </div>
      <form className="composer" onSubmit={submit}>
        {p.voiceInput !== false && (
        <button
          type="button"
          className={`mic${p.recording ? ' is-on' : ''}`}
          onClick={p.onMic}
          disabled={p.busy || p.transcribing}
          aria-pressed={p.recording}
          aria-label={p.recording ? 'Detener grabación' : 'Hablar'}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path
              d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0M12 17v4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>
        )}
        <input
          className="field composer-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          aria-label="Mensaje para KAIZER"
          autoComplete="off"
        />
        <button type="submit" className="btn btn-primary" disabled={!text.trim() || p.busy}>
          Enviar
        </button>
      </form>
    </section>
  )
}
