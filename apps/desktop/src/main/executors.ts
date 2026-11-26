import { SCHEDULABLE_TOOLS, SYSTEM_ACTIONS } from '@kaizer/core'
import type { BrowserId, RepeatMode, ToolExecutors, ToolResult } from '@kaizer/core'
import { openInBrowser } from './browser'
import { addContactQuick, normalize, recall, remember, resolveContact } from './memory'
import { Scheduler } from './scheduler'
import { SYSTEM_LABELS, openApp, systemControl } from './system'
import { latestVideo, youtubeSearchUrl } from './youtube'
import { WhatsApp } from './whatsapp'

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const fail = (summary: string): ToolResult => ({ ok: false, summary })

function describe(tool: string, a: Record<string, unknown>): string {
  switch (tool) {
    case 'open_url':
      return `Abrir ${str(a['url'])}`
    case 'youtube_latest':
      return `Último video de ${str(a['channel'])}`
    case 'web_search':
      return `Buscar "${str(a['query'])}"`
    case 'open_app':
      return `Abrir ${str(a['name'])}`
    case 'system_control':
      return SYSTEM_LABELS[str(a['action'])] ?? str(a['action'])
    case 'send_whatsapp':
      return `WhatsApp a ${str(a['contact'])}: "${str(a['message']).slice(0, 40)}"`
    default:
      return tool
  }
}

export interface ExecutorDeps {
  scheduler: () => Scheduler
  whatsapp: WhatsApp
}

export function createExecutors(deps: ExecutorDeps): ToolExecutors {
  const ex: ToolExecutors = {
    async open_url(a) {
      const url = str(a['url'])
      if (!url) return fail('Falta la dirección a abrir.')
      const pref = str(a['browser'])
      try {
        const used = await openInBrowser(url, pref === 'brave' || pref === 'default' ? (pref as BrowserId) : undefined)
        return { ok: true, summary: `Abrí ${url} en ${used}` }
      } catch (e) {
        return fail(`No pude abrir ${url}: ${e instanceof Error ? e.message : String(e)}`)
      }
    },

    async youtube_latest(a) {
      const channel = str(a['channel'])
      if (!channel) return fail('Falta el nombre del canal.')
      try {
        const v = await latestVideo(channel)
        const used = await openInBrowser(v.url)
        return { ok: true, summary: `Abrí en ${used} el último video de ${v.channel}: "${v.title}"`, data: { title: v.title } }
      } catch {
        const used = await openInBrowser(youtubeSearchUrl(channel))
        return {
          ok: true,
          summary: `No pude identificar el canal "${channel}", así que abrí en ${used} su búsqueda en YouTube ordenada por fecha`
        }
      }
    },

    async web_search(a) {
      const q = str(a['query'])
      if (!q) return fail('Falta qué buscar.')
      const used = await openInBrowser(`https://www.google.com/search?q=${encodeURIComponent(q)}`)
      return { ok: true, summary: `Busqué "${q}" en ${used}` }
    },

    async open_app(a) {
      const name = str(a['name'])
      if (!name) return fail('Falta el nombre de la aplicación.')
      try {
        const opened = await openApp(name)
        return opened
          ? { ok: true, summary: `Abrí ${opened}` }
          : fail(`No encontré una aplicación llamada "${name}" en el menú Inicio. Prueba con el nombre exacto que aparece allí.`)
      } catch (e) {
        return fail(`No pude abrir ${name}: ${e instanceof Error ? e.message : String(e)}`)
      }
    },

    async system_control(a) {
      const action = str(a['action'])
      if (!(SYSTEM_ACTIONS as readonly string[]).includes(action)) {
        return fail(`No conozco la acción "${action}". Puedo: ${SYSTEM_ACTIONS.join(', ')}.`)
      }
      try {
        await systemControl(action)
        return { ok: true, summary: SYSTEM_LABELS[action] ?? action }
      } catch (e) {
        return fail(`No pude ejecutar la acción: ${e instanceof Error ? e.message : String(e)}`)
      }
    },

    async send_whatsapp(a) {
      const contact = str(a['contact'])
      const message = str(a['message'])
      if (!contact || !message) return fail('Faltan el contacto o el mensaje.')
      const target = resolveContact(contact)
      if (!target) {
        return fail(`No tengo a "${contact}" en tu agenda. Agrégalo en Ajustes o dime su número con código de país.`)
      }
      try {
        await deps.whatsapp.send(target.phone, message)
        return { ok: true, summary: `Envié a ${target.name} por WhatsApp: "${message}"` }
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e))
      }
    },

    async schedule_task(a) {
      const tool = str(a['tool'])
      if (!(SCHEDULABLE_TOOLS as readonly string[]).includes(tool)) {
        return fail(`No puedo programar "${tool}". Elige una de: ${SCHEDULABLE_TOOLS.join(', ')}.`)
      }
      const args = (a['args'] && typeof a['args'] === 'object' ? a['args'] : {}) as Record<string, unknown>
      const rep = str(a['repeat'])
      const repeat: RepeatMode = rep === 'daily' || rep === 'weekly' ? rep : 'none'
      try {
        const t = deps.scheduler().add({ when: str(a['when']), tool, args, repeat, description: describe(tool, args) })
        const when = new Date(t.when).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' })
        const rtxt = repeat === 'daily' ? ', cada día' : repeat === 'weekly' ? ', cada semana' : ''
        return { ok: true, summary: `Programé "${t.description}" para ${when}${rtxt}`, data: { id: t.id } }
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e))
      }
    },

    async list_tasks() {
      const tasks = deps.scheduler().list()
      return {
        ok: true,
        summary: tasks.length ? `Tienes ${tasks.length} tarea(s) programada(s)` : 'No tienes tareas programadas',
        data: tasks.map((t) => ({ id: t.id, cuando: t.when, repetir: t.repeat, que: t.description }))
      }
    },

    async cancel_task(a) {
      const id = str(a['id'])
      return deps.scheduler().cancel(id)
        ? { ok: true, summary: `Cancelé la tarea ${id}` }
        : fail(`No encontré una tarea con id ${id}. Pídeme la lista de tareas para ver los ids.`)
    },

    async remember(a) {
      const key = str(a['key'])
      const value = str(a['value'])
      if (!key || !value) return fail('Faltan la clave o el valor a recordar.')
      remember(key, value)
      return { ok: true, summary: `Guardé en memoria: ${key}` }
    },

    async recall(a) {
      const q = str(a['query'])
      const hits = recall(q)
      return {
        ok: true,
        summary: hits.length ? `Encontré ${hits.length} dato(s) sobre "${q}"` : `No tengo nada guardado sobre "${q}"`,
        data: hits
      }
    },

    async add_contact(a) {
      const name = str(a['name'])
      const phone = str(a['phone'])
      if (!name || normalize(phone).replace(/\D/g, '').length < 8) {
        return fail('Necesito el nombre y un teléfono válido con código de país.')
      }
      addContactQuick(name, phone)
      return { ok: true, summary: `Agregué a ${name} a tu agenda` }
    }
  }
  return ex
}
