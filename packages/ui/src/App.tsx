import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_SETTINGS } from '@kaizer/core/shared'
import type { ActionRecord, ChatTurn, PublicSettings, Task } from '@kaizer/core'
import type { PlatformAdapter } from './adapter'
import { Chat } from './components/Chat'
import type { ChatItem } from './components/Chat'
import { ForgeCore, STATE_WORD } from './components/ForgeCore'
import type { CoreState } from './components/ForgeCore'
import { SettingsPanel } from './components/SettingsPanel'
import { useVoice } from './hooks/useVoice'

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e))

function isToday(iso: string): boolean {
  const d = new Date(iso)
  const n = new Date()
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()
}

export function App({ adapter }: { adapter: PlatformAdapter }) {
  const [settings, setSettings] = useState<PublicSettings>({ ...DEFAULT_SETTINGS, hasApiKey: true, secureStorage: true })
  const [items, setItems] = useState<ChatItem[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [busy, setBusy] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const idRef = useRef(0)
  const itemsRef = useRef(items)
  itemsRef.current = items
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  const push = useCallback((kind: ChatItem['kind'], text: string, ok?: boolean, url?: string) => {
    setItems((prev) => [...prev, { id: ++idRef.current, kind, text, ok, url }])
  }, [])

  const pushAction = useCallback(
    (a: ActionRecord) => {
      // Orden que solo la app instalada puede cumplir: fila con los botones de descarga.
      if (a.tool === 'requires_desktop' && adapter.downloads) push('download', a.summary)
      else {
        const url = (a.data as { url?: unknown } | undefined)?.url
        push('action', a.summary, a.ok, !a.ok && typeof url === 'string' ? url : undefined)
      }
    },
    [adapter, push]
  )

  const send = useCallback(
    async (text: string) => {
      const history: ChatTurn[] = itemsRef.current
        .filter((m) => m.kind === 'user' || m.kind === 'assistant')
        .slice(-12)
        .map((m) => ({ role: m.kind as 'user' | 'assistant', text: m.text }))
      push('user', text)
      setBusy(true)
      let shown = 0
      try {
        const res = await adapter.sendMessage(text, history, (p) => {
          if (p.type === 'tool-start') setExecuting(true)
          else {
            setExecuting(false)
            shown++
            pushAction(p.action)
          }
        })
        res.actions.slice(shown).forEach(pushAction)
        if (res.reply) {
          push('assistant', res.reply)
          if (settingsRef.current.voiceEnabled) voice.speak(res.reply)
        }
      } catch (e) {
        push('error', errMsg(e))
      } finally {
        setBusy(false)
        setExecuting(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [adapter, push, pushAction]
  )

  const sendRef = useRef(send)
  sendRef.current = send

  const voice = useVoice({
    transcribe: (b) => adapter.transcribe(b),
    onText: (t) => void sendRef.current(t),
    onError: (m) => push('error', m),
    listen: adapter.listen ? () => adapter.listen!() : undefined
  })

  useEffect(() => {
    void adapter.getSettings().then(setSettings).catch((e) => push('error', errMsg(e)))
    void adapter.tasks?.list().then(setTasks).catch(() => undefined)
    const offs = [
      adapter.tasks?.onChanged(setTasks),
      adapter.tasks?.onRan?.((e) => push('action', `Tarea ejecutada: ${e.summary}`, e.ok))
    ]
    return () => offs.forEach((o) => o?.())
  }, [adapter, push])

  const toggleRef = useRef(voice.toggle)
  toggleRef.current = voice.toggle
  useEffect(() => adapter.onHotkeyTalk?.(() => toggleRef.current()), [adapter])

  const state: CoreState = voice.recording
    ? 'listening'
    : busy
      ? executing
        ? 'executing'
        : 'thinking'
      : voice.speaking
        ? 'speaking'
        : 'idle'

  const todays = useMemo(() => tasks.filter((t) => isToday(t.when)), [tasks])
  const hotkey = !!adapter.onHotkeyTalk
  const closeSettings = useCallback(() => setShowSettings(false), [])
  const settingsError = useCallback((m: string) => push('error', m), [push])

  return (
    <div className={`app${showSettings ? ' is-settings' : ''}`}>
      <header className="titlebar">
        <span className="brand">KAIZER</span>
        <div className="titlebar-actions">
          {!adapter.noSettings && (
          <button
            type="button"
            className={`btn btn-quiet${showSettings ? ' is-active' : ''}`}
            onClick={() => setShowSettings((v) => !v)}
            aria-pressed={showSettings}
          >
            Ajustes
          </button>
          )}
          {adapter.windowControls && (
            <>
              <button
                type="button"
                className="winbtn"
                aria-label="Minimizar"
                onClick={() => adapter.windowControls?.minimize()}
              >
                <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
                  <path d="M2 6h8" stroke="currentColor" strokeWidth="1.4" />
                </svg>
              </button>
              <button
                type="button"
                className="winbtn winbtn-close"
                aria-label="Cerrar a la bandeja"
                onClick={() => adapter.windowControls?.close()}
              >
                <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
                  <path d="M2.5 2.5l7 7m0-7l-7 7" stroke="currentColor" strokeWidth="1.4" />
                </svg>
              </button>
            </>
          )}
        </div>
      </header>

      <main className="main">
        <aside className="core-panel">
          <div className="core-stage">
            <ForgeCore state={state} levelRef={voice.levelRef} />
          </div>
          <p className="state-word" aria-live="polite">
            {STATE_WORD[state]}
          </p>
          {adapter.tasks && (
            <div className="today">
              <h2>Tareas de hoy</h2>
              {todays.length === 0 ? (
                <p className="hint">Nada programado para hoy.</p>
              ) : (
                <ul className="today-list">
                  {todays.slice(0, 4).map((t) => (
                    <li key={t.id}>
                      <time>{new Date(t.when).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}</time>
                      <span>{t.description}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </aside>

        {showSettings ? (
          <SettingsPanel
            adapter={adapter}
            settings={settings}
            tasks={tasks}
            onSettings={setSettings}
            onTasks={setTasks}
            onClose={closeSettings}
            onError={settingsError}
          />
        ) : (
          <Chat
            items={items}
            busy={busy}
            recording={voice.recording}
            transcribing={voice.transcribing}
            hasApiKey={settings.hasApiKey}
            hotkeyHint={hotkey}
            suggestions={adapter.suggestions}
            voiceInput={adapter.voiceInput}
            downloads={adapter.downloads}
            onSend={(t) => void send(t)}
            onMic={voice.toggle}
            onOpenSettings={() => setShowSettings(true)}
          />
        )}
      </main>
    </div>
  )
}
