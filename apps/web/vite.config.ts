import { defineConfig, loadEnv } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/** Dev sin netlify-cli: monta el handler de la función en /api/chat y lee GEMINI_API_KEY de .env.local. */
function chatApi(): Plugin {
  return {
    name: 'kaizer-chat-api',
    configureServer(server) {
      server.middlewares.use('/api/chat', async (req, res) => {
        try {
          const env = loadEnv(server.config.mode, server.config.root, '')
          const mod = (await server.ssrLoadModule('/netlify/lib/chat-core.ts')) as typeof import('./netlify/lib/chat-core')
          const chunks: Buffer[] = []
          for await (const c of req) chunks.push(c as Buffer)
          const method = req.method ?? 'GET'
          const request = new Request(`http://localhost${req.url ?? ''}`, {
            method,
            headers: Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, String(v)])),
            body: method === 'GET' || method === 'HEAD' ? undefined : Buffer.concat(chunks)
          })
          const out = await mod.handleChat(request, {
            apiKey: env.GEMINI_API_KEY,
            ip: req.socket.remoteAddress ?? 'dev',
            rate: devRate(() => mod.createRateStore(true)),
            perDay: Number(env.RATE_LIMIT_PER_DAY) || undefined,
            globalPerDay: Number(env.RATE_LIMIT_GLOBAL_PER_DAY) || undefined
          })
          res.statusCode = out.status
          out.headers.forEach((v, k) => res.setHeader(k, v))
          res.end(Buffer.from(await out.arrayBuffer()))
        } catch (e) {
          server.config.logger.error(String(e))
          res.statusCode = 500
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ error: 'Error interno en la demo local. Revisa la consola de dev:web.' }))
        }
      })
    }
  }
}

// El store en memoria debe sobrevivir entre peticiones aunque Vite recargue el módulo.
let rateStore: ReturnType<(typeof import('./netlify/lib/chat-core'))['createRateStore']> | undefined
function devRate(make: () => NonNullable<typeof rateStore>): NonNullable<typeof rateStore> {
  rateStore ??= make()
  return rateStore
}

export default defineConfig({
  plugins: [react(), chatApi()],
  server: { port: 5174 }
})
