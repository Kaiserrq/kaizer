import { useEffect, useRef } from 'react'
import type { MutableRefObject } from 'react'

export type CoreState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'executing'

export const STATE_WORD: Record<CoreState, string> = {
  idle: 'En reposo',
  listening: 'Escuchando',
  thinking: 'Pensando',
  speaking: 'Hablando',
  executing: 'Ejecutando'
}

const BRASA = '255,122,47'
const LATON = '212,168,83'
const NIEBLA = '147,164,179'
const SEGMENTS = 12
const TAU = Math.PI * 2

interface Frame {
  t: number
  rot: number
  arc: number
  level: number
  state: CoreState
}

function draw(ctx: CanvasRenderingContext2D, w: number, h: number, f: Frame): void {
  ctx.clearRect(0, 0, w, h)
  const cx = w / 2
  const cy = h / 2
  const R = (Math.min(w, h) / 2) * 0.94

  // Corona exterior: 12 segmentos. Con el micrófono se abren hacia afuera y se afinan.
  const open = f.state === 'listening' ? f.level : 0
  const slot = TAU / SEGMENTS
  const span = slot * (0.8 - open * 0.38)
  ctx.lineCap = 'butt'
  for (let i = 0; i < SEGMENTS; i++) {
    const wobble = 0.6 + 0.4 * Math.sin(i * 1.7 + f.t * 5)
    const r = R * 0.86 + open * R * 0.1 * wobble
    const a0 = f.rot + i * slot - span / 2
    const alpha = 0.3 + 0.7 * ((SEGMENTS - i) / SEGMENTS)
    ctx.beginPath()
    ctx.arc(cx, cy, r, a0, a0 + span)
    ctx.lineWidth = R * (0.085 - open * 0.03)
    ctx.strokeStyle = f.state === 'listening' ? `rgba(${BRASA},${0.45 + open * 0.55})` : `rgba(${NIEBLA},${alpha})`
    ctx.stroke()
  }

  // Anillo medio de latón. Al ejecutar, un arco brillante avanza por él.
  const rm = R * 0.64
  ctx.beginPath()
  ctx.arc(cx, cy, rm, 0, TAU)
  ctx.lineWidth = R * 0.022
  ctx.strokeStyle = `rgba(${LATON},${f.state === 'executing' ? 0.35 : 0.6})`
  ctx.stroke()
  if (f.state === 'executing') {
    ctx.beginPath()
    ctx.arc(cx, cy, rm, f.arc, f.arc + Math.PI * 0.6)
    ctx.lineWidth = R * 0.05
    ctx.lineCap = 'round'
    ctx.strokeStyle = `rgb(${LATON})`
    ctx.stroke()
  }

  // Centro de brasa.
  let k = 1 + 0.04 * Math.sin(f.t * 0.9) // reposo: respira lento
  if (f.state === 'speaking') k = 1 + 0.1 * (0.5 + 0.5 * Math.sin(f.t * 8)) + 0.04 * Math.sin(f.t * 13)
  if (f.state === 'listening') k = 1 + f.level * 0.14
  if (f.state === 'thinking') k = 1 + 0.02 * Math.sin(f.t * 3)
  const rc = R * 0.34 * k
  ctx.fillStyle = `rgba(${BRASA},0.14)`
  ctx.beginPath()
  ctx.arc(cx, cy, rc * 1.35, 0, TAU)
  ctx.fill()
  ctx.fillStyle = `rgba(${BRASA},0.3)`
  ctx.beginPath()
  ctx.arc(cx, cy, rc * 1.12, 0, TAU)
  ctx.fill()
  ctx.fillStyle = `rgb(${BRASA})`
  ctx.beginPath()
  ctx.arc(cx, cy, rc, 0, TAU)
  ctx.fill()
}

const ROT_SPEED: Record<CoreState, number> = {
  idle: 0.04,
  listening: 0.08,
  thinking: 1.5,
  speaking: 0.12,
  executing: 0.2
}

export function ForgeCore({
  state,
  levelRef
}: {
  state: CoreState
  levelRef: MutableRefObject<number>
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    let w = 0
    let h = 0
    let raf = 0
    let last = performance.now()
    const f: Frame = { t: 0, rot: 0, arc: 0, level: 0, state: stateRef.current }

    const paint = (): void => {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      const dpr = window.devicePixelRatio || 1
      ctx.scale(dpr, dpr)
      f.state = stateRef.current
      draw(ctx, w, h, f)
    }

    const resize = (): void => {
      const r = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      w = r.width
      h = r.height
      canvas.width = Math.max(1, Math.round(w * dpr))
      canvas.height = Math.max(1, Math.round(h * dpr))
      paint()
    }

    const tick = (now: number): void => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      f.t += dt
      const s = stateRef.current
      f.rot += ROT_SPEED[s] * dt
      f.arc += 2.6 * dt
      f.level += ((s === 'listening' ? levelRef.current : 0) - f.level) * Math.min(1, dt * 14)
      paint()
      raf = requestAnimationFrame(tick)
    }

    const run = (): void => {
      cancelAnimationFrame(raf)
      if (media.matches) {
        f.level = 0
        paint()
      } else {
        last = performance.now()
        raf = requestAnimationFrame(tick)
      }
    }

    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    media.addEventListener('change', run)
    resize()
    run()
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      media.removeEventListener('change', run)
    }
  }, [levelRef])

  // Con movimiento reducido solo se redibuja al cambiar de estado.
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || !window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const dpr = window.devicePixelRatio || 1
    const r = canvas.getBoundingClientRect()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    draw(ctx, r.width, r.height, { t: 0, rot: 0, arc: 0, level: 0, state })
  }, [state])

  return <canvas ref={canvasRef} className="forge" role="img" aria-label={`Núcleo de KAIZER: ${STATE_WORD[state].toLowerCase()}`} />
}
