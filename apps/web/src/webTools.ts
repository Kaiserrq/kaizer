import type { ToolExecutors, ToolResult } from '@kaizer/core'

const MEMORY_KEY = 'kaizer.memory'

function readMemory(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(MEMORY_KEY) ?? '{}') as Record<string, string>
  } catch {
    return {}
  }
}

function openTab(url: string, okSummary: string): ToolResult {
  const w = window.open(url, '_blank', 'noopener,noreferrer')
  // Si el navegador bloquea la ventana (pasó mucho tiempo desde el último clic), se avisa.
  if (!w) {
    return { ok: false, summary: 'El navegador bloqueó la pestaña nueva. Usa el enlace o permite las ventanas emergentes.', data: { url } }
  }
  return { ok: true, summary: okSummary }
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

export const webExecutors: ToolExecutors = {
  async open_url({ url }) {
    let u: URL
    try {
      u = new URL(str(url))
    } catch {
      return { ok: false, summary: 'Esa dirección no es válida.' }
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return { ok: false, summary: 'Solo puedo abrir direcciones http o https.' }
    }
    return openTab(u.href, `Abrí ${u.hostname} en una pestaña nueva.`)
  },
  async web_search({ query }) {
    const q = str(query)
    if (!q) return { ok: false, summary: 'Falta el texto a buscar.' }
    return openTab(`https://www.google.com/search?q=${encodeURIComponent(q)}`, `Busqué «${q}» en una pestaña nueva.`)
  },
  async youtube_latest({ channel }) {
    const c = str(channel)
    if (!c) return { ok: false, summary: 'Falta el canal.' }
    // sp=CAI%3D ordena por fecha de subida. La web no puede leer el RSS por CORS.
    return openTab(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(c)}&sp=CAI%3D`,
      `Abrí los videos más recientes de ${c} en YouTube.`
    )
  },
  async remember({ key, value }) {
    const k = str(key)
    if (!k) return { ok: false, summary: 'Falta el nombre del dato.' }
    try {
      localStorage.setItem(MEMORY_KEY, JSON.stringify({ ...readMemory(), [k]: str(value) }))
    } catch {
      return { ok: false, summary: 'No pude guardar en este navegador.' }
    }
    return { ok: true, summary: `Guardé «${k}» en este navegador.` }
  },
  async recall({ query }) {
    const q = str(query).toLowerCase()
    const found = Object.entries(readMemory()).filter(([k, v]) => k.toLowerCase().includes(q) || v.toLowerCase().includes(q))
    return { ok: true, summary: found.length ? `Encontré ${found.length} dato(s).` : 'No encontré nada guardado.', data: found }
  },
  async requires_desktop() {
    return { ok: true, summary: 'Esto requiere instalar KAIZER en tu equipo.' }
  }
}
