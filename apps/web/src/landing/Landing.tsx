import { useEffect, useRef, useState } from 'react'
import { ForgeCore, STATE_WORD } from '@kaizer/ui/forge'
import type { CoreState } from '@kaizer/ui/forge'
import { CONFIG, apkIfAvailable } from '../config'
import './landing.css'

// El núcleo recorre sus estados solo: es el único movimiento de la página.
const CYCLE: CoreState[] = ['idle', 'listening', 'thinking', 'executing', 'speaking']

function HeroCore() {
  const [state, setState] = useState<CoreState>('idle')
  const level = useRef(0)

  useEffect(() => {
    let i = 0
    const id = window.setInterval(() => {
      i = (i + 1) % CYCLE.length
      setState(CYCLE[i] ?? 'idle')
    }, 3200)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    if (state !== 'listening') {
      level.current = 0
      return
    }
    let raf = 0
    const t0 = performance.now()
    const tick = (): void => {
      const t = (performance.now() - t0) / 1000
      level.current = Math.max(0, 0.45 + 0.3 * Math.sin(t * 7) + 0.2 * Math.sin(t * 17.3))
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [state])

  return (
    <div className="hero-core">
      <div className="hero-stage">
        <ForgeCore state={state} levelRef={level} />
      </div>
      <p className="hero-state" aria-live="off">
        {STATE_WORD[state]}
      </p>
    </div>
  )
}

function Downloads({ apk }: { apk: string | null }) {
  return (
    <div className="actions">
      <a className="lp-btn lp-btn-primary" href={CONFIG.windowsUrl}>
        Descargar para Windows
      </a>
      {apk ? (
        <a className="lp-btn" href={apk} download>
          Descargar para Android
        </a>
      ) : (
        <span className="soon">Android: próximamente</span>
      )}
    </div>
  )
}

const ORDERS = [
  {
    say: 'Abre Brave y ponme el último video de HH',
    does: 'Abre Brave, encuentra el canal por su alias y reproduce el video más reciente.'
  },
  {
    say: 'A las 12 envíale a mamá: ya llegué',
    does: 'Guarda la tarea ya resuelta y manda el WhatsApp a esa hora, aunque no estés mirando.'
  },
  {
    say: 'Sube el volumen',
    does: 'Controla volumen, reproducción y bloqueo de pantalla sin tocar el teclado.'
  }
]

export function Landing() {
  const [apk, setApk] = useState<string | null>(null)
  useEffect(() => {
    void apkIfAvailable().then(setApk)
  }, [])

  return (
    <div className="lp">
      <header className="lp-top">
        <span className="lp-brand">KAIZER</span>
        <nav aria-label="Principal">
          <a href="/demo">Demo</a>
          <a href={CONFIG.repoUrl}>GitHub</a>
        </nav>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <h1>
              <span className="lp-brand-xl">KAIZER</span>
              Tu equipo, a la orden de tu voz.
            </h1>
            <p className="lead">
              Un asistente personal para Windows. Abre programas, pone videos, envía WhatsApp y programa tareas. Habla o
              escribe, y él lo hace.
            </p>
            <Downloads apk={apk} />
            <div className="actions actions-sec">
              <a className="lp-btn" href="/demo">
                Probar la demo
              </a>
              <a className="lp-link" href={CONFIG.repoUrl}>
                Ver en GitHub
              </a>
            </div>
          </div>
          <HeroCore />
        </section>

        <section className="orders" aria-labelledby="t-orders">
          <h2 id="t-orders">Qué le puedes pedir</h2>
          <ol>
            {ORDERS.map((o) => (
              <li key={o.say}>
                <q>{o.say}</q>
                <p>{o.does}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="how" aria-labelledby="t-how">
          <div>
            <h2 id="t-how">Hecho para que lo controles tú</h2>
            <p>
              Tu memoria, tus contactos y tu API key de Gemini se quedan en tu equipo. No hay cuentas ni servidor de por
              medio. La demo web solo abre pestañas y busca; para controlar la PC necesitas la app.
            </p>
          </div>
          <ul className="facts">
            <li>Electron, React y TypeScript</li>
            <li>Gemini con llamadas a herramientas</li>
            <li>Voz con tu micrófono, respuestas habladas</li>
            <li>WhatsApp no oficial (Baileys): úsalo bajo tu responsabilidad</li>
          </ul>
        </section>

        <section className="get" aria-labelledby="t-get">
          <h2 id="t-get">Instálalo</h2>
          <Downloads apk={apk} />
        </section>
      </main>

      <footer className="lp-foot">
        <span>KAIZER</span>
        <a href={CONFIG.repoUrl}>GitHub</a>
      </footer>
    </div>
  )
}
