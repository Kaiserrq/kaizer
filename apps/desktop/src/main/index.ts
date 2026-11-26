import { BrowserWindow, Menu, Notification, Tray, app, globalShortcut, nativeImage, session, shell } from 'electron'
import { join } from 'node:path'
import icon from '../../resources/icon.png?asset'
import { createExecutors } from './executors'
import { registerIpc } from './ipc'
import { Scheduler } from './scheduler'
import { applyAutoStart, getSettings } from './settings'
import { dataPath } from './store'
import { WhatsApp } from './whatsapp'

let win: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false
const startHidden = process.argv.includes('--hidden')

if (!app.requestSingleInstanceLock()) {
  app.quit()
}

function showWindow(): void {
  if (!win) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 360,
    minHeight: 520,
    frame: false,
    show: false,
    backgroundColor: '#1B2631',
    title: 'KAIZER',
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  win.once('ready-to-show', () => {
    if (!startHidden) win?.show()
  })
  win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault()
      win?.hide()
    }
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    const appUrl = process.env['ELECTRON_RENDERER_URL']
    const allowed = appUrl ? url === appUrl || url.startsWith(`${appUrl.replace(/\/$/, '')}/`) : url.startsWith('file:')
    if (!allowed) e.preventDefault()
  })
  if (process.env['ELECTRON_RENDERER_URL']) void win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

function createTray(): void {
  tray = new Tray(nativeImage.createFromPath(icon).resize({ width: 16, height: 16 }))
  tray.setToolTip('KAIZER')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Abrir KAIZER', click: showWindow },
      { label: 'Hablar', click: talk },
      { type: 'separator' },
      {
        label: 'Salir',
        click: () => {
          quitting = true
          app.quit()
        }
      }
    ])
  )
  tray.on('click', showWindow)
}

function talk(): void {
  showWindow()
  win?.webContents.send('hotkey:talk')
}

app.on('second-instance', showWindow)

app.whenReady().then(() => {
  app.setAppUserModelId('com.kaizer.assistant')

  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === 'media'))
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === 'media')

  const whatsapp = new WhatsApp(dataPath('whatsapp-auth'))
  let scheduler: Scheduler
  const executors = createExecutors({ scheduler: () => scheduler, whatsapp })

  scheduler = new Scheduler(
    async (tool, args) => {
      const ex = executors[tool]
      if (!ex) return { ok: false, summary: `La herramienta ${tool} ya no existe.` }
      if (tool === 'send_whatsapp' && !(await whatsapp.waitConnected(20_000))) {
        return { ok: false, summary: 'WhatsApp no se conectó a tiempo. Revisa tu conexión o vincula la cuenta en Ajustes.' }
      }
      return ex(args)
    },
    (tasks) => win?.webContents.send('tasks:changed', tasks),
    (task, result) => {
      new Notification({
        title: result.ok ? 'KAIZER ejecutó una tarea' : 'KAIZER no pudo ejecutar una tarea',
        body: result.ok ? result.summary : `${task.description}. ${result.summary}`
      }).show()
      win?.webContents.send('tasks:ran', { description: task.description, summary: result.summary, ok: result.ok })
    }
  )

  whatsapp.onStatus((s) => win?.webContents.send('whatsapp:status', s))
  registerIpc({ scheduler, whatsapp, executors, getWindow: () => win })

  createWindow()
  createTray()
  scheduler.start()
  if (whatsapp.hasSession()) void whatsapp.connect()
  applyAutoStart(getSettings().autoStart)

  if (!globalShortcut.register('Control+Space', talk)) {
    console.warn('No se pudo registrar el atajo Ctrl+Espacio (otra aplicación lo usa).')
  }

  app.on('activate', showWindow)
})

app.on('before-quit', () => {
  quitting = true
})
app.on('will-quit', () => globalShortcut.unregisterAll())
// No se cierra al cerrar la ventana: sigue en la bandeja.
app.on('window-all-closed', () => undefined)
