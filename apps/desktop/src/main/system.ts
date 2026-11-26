import { app, shell } from 'electron'
import { execFile } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { normalize } from './memory'

function powershell(command: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', command],
      { windowsHide: true },
      (err) => (err ? reject(err) : resolve())
    )
  })
}

const sendKey = (code: number, times = 1): string =>
  `$w = New-Object -ComObject WScript.Shell; 1..${times} | ForEach-Object { $w.SendKeys([char]${code}) }`

export const SYSTEM_LABELS: Record<string, string> = {
  volume_up: 'Subí el volumen',
  volume_down: 'Bajé el volumen',
  mute: 'Silencié o reactivé el sonido',
  play_pause: 'Pausé o reanudé la reproducción',
  next: 'Pasé a la siguiente pista',
  previous: 'Volví a la pista anterior',
  lock: 'Bloqueé la pantalla'
}

export async function systemControl(action: string): Promise<void> {
  switch (action) {
    case 'volume_up':
      return powershell(sendKey(175, 5))
    case 'volume_down':
      return powershell(sendKey(174, 5))
    case 'mute':
      return powershell(sendKey(173))
    case 'play_pause':
      return powershell(sendKey(179))
    case 'next':
      return powershell(sendKey(176))
    case 'previous':
      return powershell(sendKey(177))
    case 'lock':
      return new Promise((resolve, reject) =>
        execFile('rundll32.exe', ['user32.dll,LockWorkStation'], (err) => (err ? reject(err) : resolve()))
      )
    default:
      throw new Error(`Acción de sistema desconocida: ${action}`)
  }
}

// ---- Aplicaciones (accesos .lnk del menú Inicio) ----
interface AppEntry {
  name: string
  path: string
  norm: string
}
let appCache: { at: number; items: AppEntry[] } | null = null

function scan(dir: string, out: AppEntry[], depth = 0): void {
  if (depth > 4 || !existsSync(dir)) return
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    const full = join(dir, e.name)
    if (e.isDirectory()) scan(full, out, depth + 1)
    else if (e.name.toLowerCase().endsWith('.lnk')) {
      const name = e.name.replace(/\.lnk$/i, '')
      out.push({ name, path: full, norm: normalize(name) })
    }
  }
}

function listApps(): AppEntry[] {
  if (appCache && Date.now() - appCache.at < 5 * 60_000) return appCache.items
  const items: AppEntry[] = []
  const roots = [
    join(process.env['ProgramData'] ?? 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs')
  ]
  for (const r of roots) scan(r, items)
  appCache = { at: Date.now(), items }
  return items
}

function distance(a: string, b: string): number {
  const m = a.length
  const n = b.length
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        (prev[j] ?? 0) + 1,
        (cur[j - 1] ?? 0) + 1,
        (prev[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
    }
    prev = cur
  }
  return prev[n] ?? 0
}

function score(q: string, e: AppEntry): number {
  if (e.norm === q) return 100
  if (e.norm.startsWith(q)) return 85
  if (e.norm.includes(q)) return 75
  const words = q.split(' ')
  if (words.every((w) => e.norm.includes(w))) return 65
  const d = distance(q, e.norm.slice(0, Math.max(q.length, 1) + 2))
  return Math.max(0, 60 - d * 12)
}

export async function openApp(name: string): Promise<string | null> {
  const q = normalize(name)
  if (!q) return null
  const ranked = listApps()
    .map((e) => ({ e, s: score(q, e) }))
    .filter((x) => x.s >= 40)
    .sort((a, b) => b.s - a.s || a.e.name.length - b.e.name.length)
  const best = ranked[0]
  if (!best) return null
  const err = await shell.openPath(best.e.path)
  if (err) throw new Error(err)
  return best.e.name
}
