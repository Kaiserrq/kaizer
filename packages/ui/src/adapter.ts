import type {
  AgentProgress,
  AgentResult,
  ChatTurn,
  Contact,
  PublicSettings,
  SettingsPatch,
  Task,
  WhatsAppStatus
} from '@kaizer/core'

export type Unsubscribe = () => void

/**
 * Lo que la UI necesita de la plataforma. Desktop lo implementa con IPC;
 * la demo web y Android podrán implementarlo con sus propias herramientas.
 * Las capacidades opcionales se ocultan en la UI si la plataforma no las tiene.
 */
export interface PlatformAdapter {
  platform: 'desktop' | 'web' | 'android'
  getSettings(): Promise<PublicSettings>
  saveSettings(patch: SettingsPatch): Promise<PublicSettings>
  /** Envía una orden al agente. Debe rechazar con Error cuyo mensaje sea apto para mostrar. */
  sendMessage(text: string, history: ChatTurn[], onProgress: (p: AgentProgress) => void): Promise<AgentResult>
  /** Convierte la grabación en texto. */
  transcribe(audio: Blob): Promise<string>

  tasks?: {
    list(): Promise<Task[]>
    cancel(id: string): Promise<Task[]>
    onChanged(cb: (tasks: Task[]) => void): Unsubscribe
    onRan?(cb: (e: { description: string; summary: string; ok: boolean }) => void): Unsubscribe
  }
  contacts?: {
    list(): Promise<Contact[]>
    save(c: Contact): Promise<Contact[]>
    remove(name: string): Promise<Contact[]>
  }
  whatsapp?: {
    status(): Promise<WhatsAppStatus>
    connect(): Promise<WhatsAppStatus>
    logout(): Promise<WhatsAppStatus>
    onStatus(cb: (s: WhatsAppStatus) => void): Unsubscribe
  }
  /** Reconocimiento de voz propio de la plataforma (web). Si existe, se usa en lugar de grabar + transcribe. */
  listen?(): { stop(): void; result: Promise<string> }
  /** false = sin entrada de voz: la UI solo ofrece texto. */
  voiceInput?: boolean
  /** Ejemplos de órdenes para el estado vacío del chat. */
  suggestions?: string[]
  /** Oculta el botón Ajustes (la demo web no tiene ajustes). */
  noSettings?: boolean
  /** Enlaces de descarga; se muestran en el chat cuando una orden requiere la app instalada. */
  downloads?: { exe: string; apk: string | null }
  windowControls?: { minimize(): void; close(): void }
  /** Atajo global para empezar a hablar. */
  onHotkeyTalk?(cb: () => void): Unsubscribe
}
