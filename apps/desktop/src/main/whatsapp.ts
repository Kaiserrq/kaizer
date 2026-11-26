import { existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import pino from 'pino'
import QRCode from 'qrcode'
import type { WASocket } from '@whiskeysockets/baileys'
import { KaizerError } from '@kaizer/core'
import type { WhatsAppStatus } from '@kaizer/core'

export class WhatsApp {
  private sock: WASocket | null = null
  private status: WhatsAppStatus = { state: 'disconnected' }
  private listeners = new Set<(s: WhatsAppStatus) => void>()
  private stopping = false
  private connecting: Promise<WhatsAppStatus> | null = null
  private retries = 0
  private retryTimer: ReturnType<typeof setTimeout> | null = null

  constructor(private authDir: string) {}

  hasSession(): boolean {
    return existsSync(join(this.authDir, 'creds.json'))
  }

  getStatus(): WhatsAppStatus {
    return this.status
  }

  onStatus(cb: (s: WhatsAppStatus) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private set(s: WhatsAppStatus): void {
    this.status = s
    for (const l of this.listeners) l(s)
  }

  /** Idempotente: llamadas simultáneas comparten la misma promesa. */
  connect(): Promise<WhatsAppStatus> {
    if (this.sock) return Promise.resolve(this.status)
    if (!this.connecting) {
      this.connecting = this.doConnect().finally(() => {
        this.connecting = null
      })
    }
    return this.connecting
  }

  /** Espera a que la sesión esté conectada (intenta conectar si hay sesión guardada). */
  waitConnected(timeoutMs: number): Promise<boolean> {
    if (this.status.state === 'connected') return Promise.resolve(true)
    if (this.status.state === 'disconnected' && this.hasSession()) void this.connect()
    return new Promise((resolve) => {
      const done = (ok: boolean): void => {
        clearTimeout(timer)
        off()
        resolve(ok)
      }
      const off = this.onStatus((s) => {
        if (s.state === 'connected') done(true)
      })
      const timer = setTimeout(() => done(false), timeoutMs)
    })
  }

  private scheduleReconnect(): void {
    const delay = Math.min(60_000, 2500 * 2 ** this.retries)
    this.retries++
    this.set({ state: 'connecting' })
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      void this.connect()
    }, delay)
  }

  private async doConnect(): Promise<WhatsAppStatus> {
    this.stopping = false
    this.set({ state: 'connecting' })
    try {
      const baileys = await import('@whiskeysockets/baileys')
      const { state, saveCreds } = await baileys.useMultiFileAuthState(this.authDir)
      let version: [number, number, number] | undefined
      try {
        version = (await baileys.fetchLatestBaileysVersion()).version
      } catch {
        /* se usa la versión incluida */
      }
      const sock = baileys.default({
        auth: state,
        ...(version ? { version } : {}),
        logger: pino({ level: 'silent' }),
        browser: ['KAIZER', 'Desktop', '1.0.0'],
        syncFullHistory: false,
        markOnlineOnConnect: false
      })
      this.sock = sock
      sock.ev.on('creds.update', saveCreds)
      sock.ev.on('connection.update', (u) => {
        void (async () => {
          if (u.qr) {
            const qr = await QRCode.toDataURL(u.qr, {
              margin: 1,
              width: 280,
              color: { dark: '#1B2631', light: '#EDF1F4' }
            })
            this.set({ state: 'qr', qr })
          }
          if (u.connection === 'open') {
            this.retries = 0
            this.set({ state: 'connected', phone: sock.user?.id.split(':')[0]?.split('@')[0] })
          }
          if (u.connection === 'close') {
            const code = (u.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output
              ?.statusCode
            if (this.sock === sock) this.sock = null
            if (code === baileys.DisconnectReason.loggedOut) {
              rmSync(this.authDir, { recursive: true, force: true })
              this.set({ state: 'disconnected' })
            } else if (code === baileys.DisconnectReason.connectionReplaced) {
              this.set({
                state: 'disconnected',
                error: 'Esta sesión de WhatsApp se abrió en otro lugar. Toca Vincular WhatsApp en Ajustes para retomarla aquí.'
              })
            } else if (code === baileys.DisconnectReason.forbidden) {
              this.set({
                state: 'disconnected',
                error: 'WhatsApp rechazó la sesión. Revisa tu cuenta en el teléfono y vuelve a vincularla desde Ajustes.'
              })
            } else if (this.stopping) {
              this.set({ state: 'disconnected' })
            } else {
              this.scheduleReconnect()
            }
          }
        })()
      })
    } catch (e) {
      this.sock = null
      this.set({
        state: 'disconnected',
        error: `No pude iniciar WhatsApp: ${e instanceof Error ? e.message : String(e)}. Revisa tu conexión e inténtalo de nuevo.`
      })
    }
    return this.status
  }

  async logout(): Promise<WhatsAppStatus> {
    this.stopping = true
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.retryTimer = null
    try {
      await this.sock?.logout()
    } catch {
      /* ya estaba desconectado */
    }
    this.sock = null
    rmSync(this.authDir, { recursive: true, force: true })
    this.set({ state: 'disconnected' })
    return this.status
  }

  async send(phone: string, text: string): Promise<void> {
    if (!this.sock || this.status.state !== 'connected') {
      throw new KaizerError('WhatsApp no está vinculado. Abre Ajustes, toca Vincular WhatsApp y escanea el QR.')
    }
    const digits = phone.replace(/[^\d]/g, '')
    let jid = `${digits}@s.whatsapp.net`
    try {
      const found = await this.sock.onWhatsApp(digits)
      const hit = found?.[0]
      if (hit && !hit.exists) throw new KaizerError(`El número ${phone} no tiene WhatsApp. Revisa que incluya el código de país.`)
      if (hit?.jid) jid = hit.jid
    } catch (e) {
      if (e instanceof KaizerError) throw e
    }
    await this.sock.sendMessage(jid, { text })
  }
}
