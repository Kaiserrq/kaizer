import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@kaizer/ui'
import type { PlatformAdapter } from '@kaizer/ui'
import { blobToWavBase64 } from './wav'

const api = window.kaizer
let seq = 0

const adapter: PlatformAdapter = {
  platform: 'desktop',
  getSettings: () => api.getSettings(),
  saveSettings: (p) => api.saveSettings(p),
  async sendMessage(text, history, onProgress) {
    const id = `r${++seq}`
    const off = api.onAgentProgress((rid, p) => {
      if (rid === id) onProgress(p)
    })
    try {
      return await api.sendMessage(id, text, history)
    } finally {
      off()
    }
  },
  async transcribe(blob) {
    let base64: string
    try {
      base64 = await blobToWavBase64(blob)
    } catch {
      throw new Error('No pude leer la grabación. Inténtalo de nuevo.')
    }
    return api.transcribe({ base64, mimeType: 'audio/wav' })
  },
  tasks: {
    list: () => api.listTasks(),
    cancel: (id) => api.cancelTask(id),
    onChanged: (cb) => api.onTasksChanged(cb),
    onRan: (cb) => api.onTaskRan(cb)
  },
  contacts: {
    list: () => api.listContacts(),
    save: (c) => api.saveContact(c),
    remove: (n) => api.removeContact(n)
  },
  whatsapp: {
    status: () => api.whatsappStatus(),
    connect: () => api.whatsappConnect(),
    logout: () => api.whatsappLogout(),
    onStatus: (cb) => api.onWhatsappStatus(cb)
  },
  windowControls: {
    minimize: () => void api.minimize(),
    close: () => void api.close()
  },
  onHotkeyTalk: (cb) => api.onHotkeyTalk(cb)
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App adapter={adapter} />
  </StrictMode>
)
