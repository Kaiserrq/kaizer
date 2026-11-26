import { createHash } from 'node:crypto'
import { GeminiProvider, KaizerError, WEB_TOOL_NAMES, buildSystemPrompt, webToolSchemas } from '../../../../packages/core/src/index'
import type { ChatMessage, ToolCall } from '../../../../packages/core/src/index'

/** Límites fijados en el servidor. El cliente no puede cambiarlos. */
export const LIMITS = {
  model: 'gemini-2.5-flash',
  maxMessages: 20,
  maxChars: 1000,
  maxBodyBytes: 100_000,
  maxParts: 8,
  maxSignature: 2048,
  perDay: 40,
  globalPerDay: 600
}

export const RATE_LIMIT_MESSAGE =
  'Llegaste al límite de la demo por hoy. Descarga KAIZER para usarlo sin límites con tu propia key.'

export interface RateStore {
  get(key: string): Promise<number>
  set(key: string, value: number): Promise<void>
}

export interface ChatDeps {
  apiKey?: string
  ip: string
  rate: RateStore
  perDay?: number
  globalPerDay?: number
}

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  })

const fail = (status: number, error: string, code?: string): Response => json(status, { error, code })

/**
 * Contador por IP y día en Netlify Blobs (consistencia strong). Es un límite BLANDO: leer y escribir
 * no es atómico, así que peticiones simultáneas pueden pasarse un poco del tope.
 * La memoria solo se usa en dev (memoryFallback); en producción un fallo de Blobs lanza error (503).
 */
export function createRateStore(memoryFallback = false): RateStore {
  const mem = new Map<string, number>()
  let warned = false
  const blobs = async () => {
    const { getStore } = await import('@netlify/blobs')
    return getStore({ name: 'kaizer-rate', consistency: 'strong' })
  }
  const fallback = (e: unknown): void => {
    if (!memoryFallback) throw e
    if (!warned) {
      warned = true
      console.warn('[kaizer] Netlify Blobs no disponible: límite en memoria (solo dev).')
    }
  }
  return {
    async get(key) {
      try {
        return Number(await (await blobs()).get(key)) || 0
      } catch (e) {
        fallback(e)
        return mem.get(key) ?? 0
      }
    },
    async set(key, value) {
      try {
        await (await blobs()).set(key, String(value))
      } catch (e) {
        fallback(e)
        mem.set(key, value)
      }
    }
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** Reconstruye `raw` solo con claves conocidas; si algo no encaja devuelve undefined. */
function cleanRaw(raw: unknown): unknown {
  if (!isObj(raw) || raw.role !== 'model' || !Array.isArray(raw.parts) || raw.parts.length > LIMITS.maxParts) return undefined
  const parts: Record<string, unknown>[] = []
  for (const p of raw.parts) {
    if (!isObj(p)) return undefined
    const part: Record<string, unknown> = {}
    if (typeof p.thoughtSignature === 'string') {
      if (p.thoughtSignature.length > LIMITS.maxSignature) return undefined
      part.thoughtSignature = p.thoughtSignature
    } else if (p.thoughtSignature !== undefined) return undefined
    if (typeof p.text === 'string') {
      if (p.text.length > LIMITS.maxChars) return undefined
      part.text = p.text
    } else if (isObj(p.functionCall)) {
      const { name, args } = p.functionCall
      if (typeof name !== 'string' || !(WEB_TOOL_NAMES as readonly string[]).includes(name)) return undefined
      if (args !== undefined && !isObj(args)) return undefined
      part.functionCall = { name, args: args ?? {} }
    } else return undefined
    parts.push(part)
  }
  return { role: 'model', parts }
}

function clean(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) throw new KaizerError('Petición inválida.')
  const out: ChatMessage[] = []
  for (const m of raw.slice(-LIMITS.maxMessages)) {
    if (!m || typeof m !== 'object') continue
    const r = m as Record<string, unknown>
    const content = typeof r.content === 'string' ? r.content.slice(0, LIMITS.maxChars) : ''
    if (r.role === 'user') {
      out.push({ role: 'user', content })
    } else if (r.role === 'assistant') {
      const toolCalls: ToolCall[] = Array.isArray(r.toolCalls)
        ? (r.toolCalls as unknown[]).flatMap((c) => {
            const t = c as { id?: unknown; name?: unknown; args?: unknown }
            if (typeof t?.name !== 'string' || t.name.length > 64) return []
            const args = t.args && typeof t.args === 'object' ? (t.args as Record<string, unknown>) : {}
            return [{ id: typeof t.id === 'string' ? t.id : undefined, name: t.name, args }]
          })
        : []
      out.push({
        role: 'assistant',
        content,
        toolCalls: toolCalls.length ? toolCalls : undefined,
        raw: cleanRaw(r.raw)
      })
    } else if (r.role === 'tool' && typeof r.name === 'string') {
      out.push({
        role: 'tool',
        name: r.name.slice(0, 64),
        content,
        callId: typeof r.callId === 'string' ? r.callId : undefined
      })
    }
  }
  // El historial recortado debe empezar por un mensaje del usuario.
  while (out.length && out[0]?.role !== 'user') out.shift()
  if (!out.length) throw new KaizerError('Petición inválida.')
  return out
}

export async function handleChat(req: Request, deps: ChatDeps): Promise<Response> {
  if (req.method !== 'POST') return fail(405, 'Método no permitido. Usa POST.')
  if (!deps.apiKey) {
    return fail(503, 'La demo no está configurada: falta la variable GEMINI_API_KEY en el servidor.', 'no_key')
  }

  let body: { messages?: unknown; tools?: unknown }
  try {
    const declared = Number(req.headers.get('content-length') ?? 0)
    if (declared > LIMITS.maxBodyBytes) return fail(413, 'La petición es demasiado grande.')
    const text = await req.text()
    if (text.length > LIMITS.maxBodyBytes) return fail(413, 'La petición es demasiado grande.')
    body = JSON.parse(text) as typeof body
  } catch {
    return fail(400, 'Petición inválida.')
  }

  let messages: ChatMessage[]
  try {
    messages = clean(body.messages)
  } catch (e) {
    return fail(400, e instanceof Error ? e.message : 'Petición inválida.')
  }
  // El cliente solo elige nombres; las definiciones salen del servidor y solo de la lista web.
  const wanted = new Set(Array.isArray(body.tools) ? body.tools.filter((t): t is string => typeof t === 'string') : [])
  const tools = webToolSchemas().filter((t) => wanted.has(t.name))

  const limit = deps.perDay ?? LIMITS.perDay
  const globalLimit = deps.globalPerDay ?? LIMITS.globalPerDay
  const day = new Date().toISOString().slice(0, 10)
  const who = createHash('sha256').update(deps.ip).digest('hex').slice(0, 24)
  const key = `${day}:${who}`
  const gkey = `${day}:global`
  try {
    const [used, total] = await Promise.all([deps.rate.get(key), deps.rate.get(gkey)])
    if (used >= limit || total >= globalLimit) return fail(429, RATE_LIMIT_MESSAGE, 'rate_limit')
    await Promise.all([deps.rate.set(key, used + 1), deps.rate.set(gkey, total + 1)])
  } catch (e) {
    console.error('[kaizer] rate limit store:', e)
    return fail(503, 'La demo no está disponible ahora mismo. Inténtalo más tarde.')
  }

  try {
    const provider = new GeminiProvider({ apiKey: deps.apiKey, model: LIMITS.model })
    const reply = await provider.chat(buildSystemPrompt(new Date(), 'web'), messages, tools)
    return json(200, reply)
  } catch (e) {
    console.error('[kaizer] gemini:', e)
    return fail(502, 'KAIZER no pudo responder. Intenta de nuevo en un momento.')
  }
}
