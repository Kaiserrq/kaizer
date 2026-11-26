import { shell } from 'electron'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { BrowserId } from '@kaizer/core'
import { getSettings } from './settings'

export function findBrave(): string | null {
  const rel = join('BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe')
  const bases = [
    process.env['ProgramFiles'],
    process.env['ProgramFiles(x86)'],
    process.env['LOCALAPPDATA']
  ].filter((b): b is string => !!b)
  for (const b of bases) {
    const p = join(b, rel)
    if (existsSync(p)) return p
  }
  return null
}

/** Abre una URL http(s). Devuelve el nombre del navegador usado. */
export async function openInBrowser(url: string, browser?: BrowserId): Promise<'Brave' | 'el navegador predeterminado'> {
  const u = new URL(url)
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('Solo puedo abrir direcciones http o https.')
  }
  const choice = browser ?? getSettings().browser
  if (choice === 'brave') {
    const exe = findBrave()
    if (exe) {
      const child = spawn(exe, [u.toString()], { detached: true, stdio: 'ignore' })
      child.on('error', () => void shell.openExternal(u.toString()))
      child.unref()
      return 'Brave'
    }
  }
  await shell.openExternal(u.toString())
  return 'el navegador predeterminado'
}
