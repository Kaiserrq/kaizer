// Tipos compartidos entre core, ui y las plataformas (desktop, web, Android).

export type BrowserId = 'brave' | 'default'
export type RepeatMode = 'none' | 'daily' | 'weekly'

export interface Settings {
  geminiModel: string
  browser: BrowserId
  voiceEnabled: boolean
  autoStart: boolean
}

export interface PublicSettings extends Settings {
  /** Hay una API key de Gemini guardada (nunca se devuelve la key). */
  hasApiKey: boolean
  /** El sistema permite cifrar la API key. */
  secureStorage: boolean
}

export interface SettingsPatch extends Partial<Settings> {
  /** Texto = guardar; null = borrar. */
  apiKey?: string | null
}

export const DEFAULT_SETTINGS: Settings = {
  geminiModel: 'gemini-3.8-flash',
  browser: 'brave',
  voiceEnabled: true,
  autoStart: false
}

export interface Contact {
  name: string
  phone: string
  aliases: string[]
}

export interface Task {
  id: string
  /** Fecha y hora local en ISO (YYYY-MM-DDTHH:mm). */
  when: string
  tool: string
  args: Record<string, unknown>
  repeat: RepeatMode
  description: string
  createdAt: string
  lastRun?: string
  /** Fallos consecutivos al ejecutar (máx. 3). */
  attempts?: number
  /** Próximo reintento (ISO) tras un fallo. */
  retryAt?: string
  /** Agotó los reintentos: no se vuelve a ejecutar hasta que se cancele. */
  failed?: boolean
  lastError?: string
}

export interface ActionRecord {
  tool: string
  args: Record<string, unknown>
  ok: boolean
  summary: string
  /** Datos opcionales de la herramienta (p. ej. { url } si la web bloqueó la pestaña). */
  data?: unknown
}

export type AgentProgress =
  | { type: 'tool-start'; tool: string }
  | { type: 'action'; action: ActionRecord }

export interface AgentResult {
  reply: string
  actions: ActionRecord[]
}

export interface ChatTurn {
  role: 'user' | 'assistant'
  text: string
}

export type WhatsAppState = 'disconnected' | 'connecting' | 'qr' | 'connected'
export interface WhatsAppStatus {
  state: WhatsAppState
  /** QR como data URL, solo en estado 'qr'. */
  qr?: string
  phone?: string
  error?: string
}

/** Error con mensaje listo para mostrar al usuario (qué pasó y cómo arreglarlo). */
export class KaizerError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'KaizerError'
  }
}
