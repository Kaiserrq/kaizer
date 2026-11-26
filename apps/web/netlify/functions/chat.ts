import { createRateStore, handleChat } from '../lib/chat-core'

const rate = createRateStore(false)

// Función de Netlify en /api/chat: UNA llamada a Gemini por petición. La key vive solo aquí.
export default async (req: Request, context: { ip?: string }): Promise<Response> => {
  const ip =
    req.headers.get('x-nf-client-connection-ip') ??
    context.ip ??
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'desconocida'
  return handleChat(req, {
    apiKey: process.env.GEMINI_API_KEY,
    ip,
    rate,
    perDay: Number(process.env.RATE_LIMIT_PER_DAY) || undefined,
    globalPerDay: Number(process.env.RATE_LIMIT_GLOBAL_PER_DAY) || undefined
  })
}

export const config = { path: '/api/chat' }
