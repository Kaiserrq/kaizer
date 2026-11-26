import { BrowserWindow, ipcMain } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { GeminiProvider, KaizerError, runAgent, transcribeWithGemini } from '@kaizer/core'
import type { Contact, ChatTurn, SettingsPatch, ToolExecutors } from '@kaizer/core'
import type { IpcResult } from '../shared/api'
import { listContacts, removeContact, saveContact } from './memory'
import type { Scheduler } from './scheduler'
import { getApiKey, getPublicSettings, getSettings, saveSettings } from './settings'
import type { WhatsApp } from './whatsapp'

function handle<A extends unknown[], T>(channel: string, fn: (e: IpcMainInvokeEvent, ...a: A) => T | Promise<T>): void {
  ipcMain.handle(channel, async (e, ...args): Promise<IpcResult<T>> => {
    try {
      return { ok: true, data: await fn(e, ...(args as A)) }
    } catch (err) {
      const error =
        err instanceof KaizerError
          ? err.message
          : `Algo falló por dentro: ${err instanceof Error ? err.message : String(err)}. Inténtalo de nuevo.`
      return { ok: false, error }
    }
  })
}

export interface IpcDeps {
  scheduler: Scheduler
  whatsapp: WhatsApp
  executors: ToolExecutors
  getWindow: () => BrowserWindow | null
}

export function registerIpc(d: IpcDeps): void {
  handle('settings:get', () => getPublicSettings())
  handle('settings:save', (_e, patch: SettingsPatch) => saveSettings(patch))

  handle('agent:send', async (e, requestId: string, text: string, history: ChatTurn[]) => {
    const apiKey = await getApiKey()
    if (!apiKey) throw new KaizerError('Falta tu API key de Gemini. Agrégala en Ajustes.')
    const provider = new GeminiProvider({ apiKey, model: getSettings().geminiModel })
    return runAgent({
      provider,
      executors: d.executors,
      history,
      userText: text,
      onProgress: (p) => e.sender.send('agent:progress', requestId, p)
    })
  })

  handle('voice:transcribe', async (_e, audio: { base64: string; mimeType: string }) => {
    const apiKey = await getApiKey()
    if (!apiKey) throw new KaizerError('Falta tu API key de Gemini. Agrégala en Ajustes.')
    return transcribeWithGemini({ apiKey, model: getSettings().geminiModel }, audio)
  })

  handle('tasks:list', () => d.scheduler.list())
  handle('tasks:cancel', (_e, id: string) => {
    d.scheduler.cancel(id)
    return d.scheduler.list()
  })

  handle('contacts:list', () => listContacts())
  handle('contacts:save', (_e, c: Contact) => {
    if (!c.name?.trim() || c.phone.replace(/\D/g, '').length < 8) {
      throw new KaizerError('Escribe un nombre y un teléfono válido con código de país, por ejemplo +521234567890.')
    }
    return saveContact(c)
  })
  handle('contacts:remove', (_e, name: string) => removeContact(name))

  handle('whatsapp:status', () => d.whatsapp.getStatus())
  handle('whatsapp:connect', () => d.whatsapp.connect())
  handle('whatsapp:logout', () => d.whatsapp.logout())

  handle('window:minimize', () => d.getWindow()?.minimize())
  handle('window:close', () => d.getWindow()?.close())
}
