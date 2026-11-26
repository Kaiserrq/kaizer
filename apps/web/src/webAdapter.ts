import { DEFAULT_SETTINGS, runAgent, webToolSchemas } from '@kaizer/core'
import type { PublicSettings } from '@kaizer/core'
import type { PlatformAdapter } from '@kaizer/ui'
import { CONFIG } from './config'
import { ProxyProvider } from './proxyProvider'
import { webExecutors } from './webTools'

interface Recognition {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
}
type RecognitionCtor = new () => Recognition

const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition

const settings: PublicSettings = { ...DEFAULT_SETTINGS, hasApiKey: true, secureStorage: true }

export function createWebAdapter(apk: string | null): PlatformAdapter {
  const provider = new ProxyProvider()
  return {
    platform: 'web',
    noSettings: true,
    voiceInput: !!SR,
    suggestions: [
      'Ponme los últimos videos de Veritasium',
      'Busca recetas de pasta',
      'Abre github.com',
      'Sube el volumen'
    ],
    downloads: { exe: CONFIG.windowsUrl, apk },
    getSettings: async () => settings,
    saveSettings: async () => settings,
    sendMessage: (text, history, onProgress) =>
      runAgent({
        provider,
        executors: webExecutors,
        history,
        userText: text,
        onProgress,
        tools: webToolSchemas(),
        variant: 'web'
      }),
    transcribe: async () => {
      throw new Error('Este navegador no permite entrada de voz. Escribe tu orden.')
    },
    listen() {
      if (!SR) throw new Error('Este navegador no permite entrada de voz. Escribe tu orden.')
      const r = new SR()
      r.lang = 'es-ES'
      r.interimResults = false
      r.continuous = false
      let text = ''
      const result = new Promise<string>((resolve, reject) => {
        r.onresult = (e) => {
          for (let i = 0; i < e.results.length; i++) {
            const item = e.results[i]
            if (item?.isFinal && item[0]) text += item[0].transcript
          }
        }
        r.onerror = (e) => {
          if (e.error === 'no-speech' || e.error === 'aborted') resolve('')
          else if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
            reject(new Error('KAIZER no tiene permiso para usar el micrófono. Permítelo en el navegador.'))
          } else reject(new Error('No pude reconocer tu voz. Escribe tu orden o inténtalo de nuevo.'))
        }
        r.onend = () => resolve(text)
      })
      r.start()
      return { stop: () => r.stop(), result }
    }
  }
}
