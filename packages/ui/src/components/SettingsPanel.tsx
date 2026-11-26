import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { BrowserId, Contact, PublicSettings, Task, WhatsAppStatus } from '@kaizer/core'
import type { PlatformAdapter } from '../adapter'

interface Props {
  adapter: PlatformAdapter
  settings: PublicSettings
  tasks: Task[]
  onSettings: (s: PublicSettings) => void
  onTasks: (t: Task[]) => void
  onClose: () => void
  onError: (msg: string) => void
}

const MODELS = ['gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-4-hydrogen']

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e))

function Switch(p: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="row">
      <div className="row-text">
        <span id={`sw-${p.label}`}>{p.label}</span>
        {p.hint && <span className="hint">{p.hint}</span>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={p.checked}
        aria-labelledby={`sw-${p.label}`}
        className={`switch${p.checked ? ' is-on' : ''}`}
        onClick={() => p.onChange(!p.checked)}
      >
        <span />
      </button>
    </div>
  )
}

export function SettingsPanel({ adapter, settings, tasks, onSettings, onTasks, onClose, onError }: Props) {
  const [apiKey, setApiKey] = useState('')
  const [saved, setSaved] = useState('')
  const [wa, setWa] = useState<WhatsAppStatus>({ state: 'disconnected' })
  const [contacts, setContacts] = useState<Contact[]>([])
  const [cName, setCName] = useState('')
  const [cPhone, setCPhone] = useState('')
  const [cAliases, setCAliases] = useState('')

  useEffect(() => {
    if (adapter.whatsapp) {
      void adapter.whatsapp.status().then(setWa)
      return adapter.whatsapp.onStatus(setWa)
    }
    return undefined
  }, [adapter])

  useEffect(() => {
    void adapter.contacts?.list().then(setContacts).catch((e) => onError(msg(e)))
  }, [adapter, onError])

  const patch = async (p: Parameters<PlatformAdapter['saveSettings']>[0]): Promise<void> => {
    try {
      onSettings(await adapter.saveSettings(p))
    } catch (e) {
      onError(msg(e))
    }
  }

  const saveKey = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    if (!apiKey.trim()) return
    await patch({ apiKey })
    setApiKey('')
    setSaved('API key guardada y cifrada en este equipo.')
  }

  const addContact = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    try {
      setContacts(
        (await adapter.contacts?.save({
          name: cName,
          phone: cPhone,
          aliases: cAliases.split(',').map((a) => a.trim()).filter(Boolean)
        })) ?? contacts
      )
      setCName('')
      setCPhone('')
      setCAliases('')
    } catch (err) {
      onError(msg(err))
    }
  }

  return (
    <section className="settings" aria-label="Ajustes">
      <header className="settings-head">
        <h2>Ajustes</h2>
        <button type="button" className="btn" onClick={onClose}>
          Volver al chat
        </button>
      </header>

      <div className="settings-body">
        <section className="group" aria-labelledby="g-gemini">
          <h3 id="g-gemini">Gemini</h3>
          <form className="stack" onSubmit={saveKey}>
            <label className="label" htmlFor="apikey">
              API key de Gemini
            </label>
            <div className="inline">
              <input
                id="apikey"
                className="field"
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value)
                  setSaved('')
                }}
                placeholder={settings.hasApiKey ? 'Guardada. Escribe otra para reemplazarla' : 'Pega tu API key'}
              />
              <button type="submit" className="btn btn-primary" disabled={!apiKey.trim()}>
                Guardar
              </button>
              {settings.hasApiKey && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    void patch({ apiKey: null })
                    setSaved('API key borrada.')
                  }}
                >
                  Borrar
                </button>
              )}
            </div>
            <p className="hint" role="status">
              {saved ||
                (settings.hasApiKey
                  ? 'Hay una API key guardada y cifrada en este equipo.'
                  : 'Aún no hay API key. Consíguela gratis en aistudio.google.com/apikey.')}
            </p>
            {!settings.secureStorage && (
              <p className="hint hint-error">
                Este equipo no permite cifrar la API key, así que no podré guardarla.
              </p>
            )}
          </form>
          <label className="label" htmlFor="model">
            Modelo
          </label>
          <input
            id="model"
            className="field"
            list="models"
            defaultValue={settings.geminiModel}
            onBlur={(e) => {
              const v = e.target.value.trim()
              if (v && v !== settings.geminiModel) void patch({ geminiModel: v })
            }}
          />
          <datalist id="models">
            {MODELS.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </section>

        <section className="group" aria-labelledby="g-pref">
          <h3 id="g-pref">Preferencias</h3>
          <div className="row">
            <label className="row-text" htmlFor="browser">
              Navegador preferido
            </label>
            <select
              id="browser"
              className="field field-select"
              value={settings.browser}
              onChange={(e) => void patch({ browser: e.target.value as BrowserId })}
            >
              <option value="brave">Brave</option>
              <option value="default">Predeterminado del sistema</option>
            </select>
          </div>
          <Switch
            label="Respuestas por voz"
            hint="KAIZER lee sus respuestas en voz alta."
            checked={settings.voiceEnabled}
            onChange={(v) => void patch({ voiceEnabled: v })}
          />
          {adapter.platform === 'desktop' && (
            <Switch
              label="Iniciar con Windows"
              hint="KAIZER arranca en la bandeja al encender el equipo."
              checked={settings.autoStart}
              onChange={(v) => void patch({ autoStart: v })}
            />
          )}
        </section>

        {adapter.whatsapp && (
          <section className="group" aria-labelledby="g-wa">
            <h3 id="g-wa">WhatsApp</h3>
            {wa.state === 'connected' && (
              <div className="stack">
                <p>Vinculado{wa.phone ? ` como +${wa.phone}` : ''}.</p>
                <div>
                  <button type="button" className="btn" onClick={() => void adapter.whatsapp?.logout()}>
                    Desvincular
                  </button>
                </div>
              </div>
            )}
            {wa.state === 'qr' && wa.qr && (
              <div className="qr">
                <img src={wa.qr} alt="Código QR para vincular WhatsApp" width={200} height={200} />
                <p className="hint">
                  En tu teléfono abre WhatsApp, entra a Dispositivos vinculados, toca Vincular un dispositivo y escanea este
                  código.
                </p>
              </div>
            )}
            {wa.state === 'connecting' && <p className="hint">Conectando con WhatsApp…</p>}
            {wa.state === 'disconnected' && (
              <div className="stack">
                {wa.error && <p className="hint hint-error">{wa.error}</p>}
                <p className="hint">Vincula tu cuenta para que KAIZER envíe mensajes por ti. La sesión queda solo en este equipo.</p>
                <div>
                  <button type="button" className="btn btn-primary" onClick={() => void adapter.whatsapp?.connect()}>
                    Vincular WhatsApp
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {adapter.contacts && (
          <section className="group" aria-labelledby="g-contacts">
            <h3 id="g-contacts">Contactos y alias</h3>
            {contacts.length === 0 ? (
              <p className="hint">Aún no tienes contactos. Agrega uno para decir, por ejemplo, «escríbele a mamá».</p>
            ) : (
              <ul className="list">
                {contacts.map((c) => (
                  <li key={c.name} className="list-row">
                    <div className="row-text">
                      <span>{c.name}</span>
                      <span className="hint">
                        {c.phone}
                        {c.aliases.length > 0 ? ` · alias: ${c.aliases.join(', ')}` : ''}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-quiet"
                      aria-label={`Quitar a ${c.name}`}
                      onClick={() => void adapter.contacts?.remove(c.name).then(setContacts).catch((e) => onError(msg(e)))}
                    >
                      Quitar
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <form className="stack" onSubmit={addContact}>
              <div className="grid-3">
                <div>
                  <label className="label" htmlFor="c-name">
                    Nombre
                  </label>
                  <input id="c-name" className="field" value={cName} onChange={(e) => setCName(e.target.value)} />
                </div>
                <div>
                  <label className="label" htmlFor="c-phone">
                    Teléfono con código de país
                  </label>
                  <input
                    id="c-phone"
                    className="field"
                    inputMode="tel"
                    placeholder="+521234567890"
                    value={cPhone}
                    onChange={(e) => setCPhone(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="c-alias">
                    Alias, separados por coma
                  </label>
                  <input
                    id="c-alias"
                    className="field"
                    placeholder="mamá, ma"
                    value={cAliases}
                    onChange={(e) => setCAliases(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <button type="submit" className="btn" disabled={!cName.trim() || !cPhone.trim()}>
                  Guardar contacto
                </button>
              </div>
            </form>
          </section>
        )}

        {adapter.tasks && (
          <section className="group" aria-labelledby="g-tasks">
            <h3 id="g-tasks">Tareas programadas</h3>
            {tasks.length === 0 ? (
              <p className="hint">No hay tareas. Pídele a KAIZER algo como «abre Spotify mañana a las 8».</p>
            ) : (
              <ul className="list">
                {tasks.map((t) => (
                  <li key={t.id} className="list-row list-row-brass">
                    <div className="row-text">
                      <span>{t.description}</span>
                      <span className="hint">
                        {new Date(t.when).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' })}
                        {t.repeat === 'daily' ? ' · cada día' : t.repeat === 'weekly' ? ' · cada semana' : ''}
                        {t.failed
                          ? ` · falló tras 3 intentos${t.lastError ? `: ${t.lastError}` : ''}. Cancélala y vuelve a pedirla.`
                          : t.attempts
                            ? ` · reintentando (${t.attempts}/3)`
                            : ''}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-quiet"
                      aria-label={`Cancelar ${t.description}`}
                      onClick={() => void adapter.tasks?.cancel(t.id).then(onTasks).catch((e) => onError(msg(e)))}
                    >
                      Cancelar
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </section>
  )
}
