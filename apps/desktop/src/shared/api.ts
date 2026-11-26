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

export interface TaskRanEvent {
  description: string
  summary: string
  ok: boolean
}

/** API tipada que el preload expone en window.kaizer. */
export interface KaizerApi {
  getSettings(): Promise<PublicSettings>
  saveSettings(patch: SettingsPatch): Promise<PublicSettings>
  sendMessage(requestId: string, text: string, history: ChatTurn[]): Promise<AgentResult>
  onAgentProgress(cb: (requestId: string, p: AgentProgress) => void): () => void
  transcribe(audio: { base64: string; mimeType: string }): Promise<string>
  listTasks(): Promise<Task[]>
  cancelTask(id: string): Promise<Task[]>
  onTasksChanged(cb: (tasks: Task[]) => void): () => void
  onTaskRan(cb: (e: TaskRanEvent) => void): () => void
  listContacts(): Promise<Contact[]>
  saveContact(c: Contact): Promise<Contact[]>
  removeContact(name: string): Promise<Contact[]>
  whatsappStatus(): Promise<WhatsAppStatus>
  whatsappConnect(): Promise<WhatsAppStatus>
  whatsappLogout(): Promise<WhatsAppStatus>
  onWhatsappStatus(cb: (s: WhatsAppStatus) => void): () => void
  minimize(): Promise<void>
  close(): Promise<void>
  onHotkeyTalk(cb: () => void): () => void
}

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string }
