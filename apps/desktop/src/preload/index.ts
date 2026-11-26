import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type { IpcResult, KaizerApi } from '../shared/api'

async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const res = (await ipcRenderer.invoke(channel, ...args)) as IpcResult<T>
  if (!res.ok) throw new Error(res.error)
  return res.data
}

function listen<A extends unknown[]>(channel: string, cb: (...a: A) => void): () => void {
  const handler = (_e: IpcRendererEvent, ...a: unknown[]): void => cb(...(a as A))
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: KaizerApi = {
  getSettings: () => call('settings:get'),
  saveSettings: (patch) => call('settings:save', patch),
  sendMessage: (requestId, text, history) => call('agent:send', requestId, text, history),
  onAgentProgress: (cb) => listen('agent:progress', cb),
  transcribe: (audio) => call('voice:transcribe', audio),
  listTasks: () => call('tasks:list'),
  cancelTask: (id) => call('tasks:cancel', id),
  onTasksChanged: (cb) => listen('tasks:changed', cb),
  onTaskRan: (cb) => listen('tasks:ran', cb),
  listContacts: () => call('contacts:list'),
  saveContact: (c) => call('contacts:save', c),
  removeContact: (name) => call('contacts:remove', name),
  whatsappStatus: () => call('whatsapp:status'),
  whatsappConnect: () => call('whatsapp:connect'),
  whatsappLogout: () => call('whatsapp:logout'),
  onWhatsappStatus: (cb) => listen('whatsapp:status', cb),
  minimize: () => call('window:minimize'),
  close: () => call('window:close'),
  onHotkeyTalk: (cb) => listen('hotkey:talk', cb)
}

contextBridge.exposeInMainWorld('kaizer', api)
