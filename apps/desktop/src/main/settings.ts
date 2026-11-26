import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { DEFAULT_SETTINGS, KaizerError } from '@kaizer/core'
import type { PublicSettings, Settings, SettingsPatch } from '@kaizer/core'
import { dataPath, readJson, writeJson } from './store'

const settingsFile = (): string => dataPath('settings.json')
const keyFile = (): string => dataPath('apikey.bin')

let cache: Settings | null = null

export function getSettings(): Settings {
  if (!cache) cache = { ...DEFAULT_SETTINGS, ...readJson<Partial<Settings>>(settingsFile(), {}) }
  return cache
}

export async function getApiKey(): Promise<string | null> {
  try {
    if (!existsSync(keyFile()) || !(await safeStorage.isAsyncEncryptionAvailable())) return null
    const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(readFileSync(keyFile()))
    if (shouldReEncrypt) writeFileSync(keyFile(), await safeStorage.encryptStringAsync(result))
    return result
  } catch {
    return null
  }
}

export async function getPublicSettings(): Promise<PublicSettings> {
  return {
    ...getSettings(),
    hasApiKey: existsSync(keyFile()),
    secureStorage: await safeStorage.isAsyncEncryptionAvailable()
  }
}

export function applyAutoStart(enabled: boolean): void {
  // En desarrollo no se registra: apuntaría al binario de Electron suelto.
  if (!app.isPackaged) return
  app.setLoginItemSettings({ openAtLogin: enabled, args: ['--hidden'] })
}

/** Conserva solo las claves de Settings con el tipo correcto. */
function sanitize(raw: Record<string, unknown>): Partial<Settings> {
  const out: Partial<Settings> = {}
  if (typeof raw['geminiModel'] === 'string' && raw['geminiModel'].trim()) out.geminiModel = raw['geminiModel'].trim()
  if (raw['browser'] === 'brave' || raw['browser'] === 'default') out.browser = raw['browser']
  if (typeof raw['voiceEnabled'] === 'boolean') out.voiceEnabled = raw['voiceEnabled']
  if (typeof raw['autoStart'] === 'boolean') out.autoStart = raw['autoStart']
  return out
}

export async function saveSettings(patch: SettingsPatch): Promise<PublicSettings> {
  const apiKey = patch.apiKey
  const rest = sanitize(patch as Record<string, unknown>)
  if (apiKey === null || typeof apiKey === 'string') {
    if (apiKey === null || apiKey.trim() === '') {
      rmSync(keyFile(), { force: true })
    } else {
      if (!(await safeStorage.isAsyncEncryptionAvailable())) {
        throw new KaizerError(
          'Este equipo no permite cifrar la API key, así que no la guardé. Inicia sesión con tu usuario de Windows e inténtalo de nuevo.'
        )
      }
      writeFileSync(keyFile(), await safeStorage.encryptStringAsync(apiKey.trim()))
    }
  }
  const next: Settings = { ...getSettings(), ...rest }
  cache = next
  writeJson(settingsFile(), next)
  if (rest.autoStart !== undefined) applyAutoStart(next.autoStart)
  return getPublicSettings()
}
