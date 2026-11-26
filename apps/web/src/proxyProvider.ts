import { KaizerError } from '@kaizer/core'
import type { ChatMessage, LLMProvider, ProviderReply, ToolSchema } from '@kaizer/core'

/** Proveedor que delega en /api/chat (la key de Gemini vive solo en el servidor). */
export class ProxyProvider implements LLMProvider {
  constructor(private endpoint = '/api/chat') {}

  async chat(_system: string, messages: ChatMessage[], tools: ToolSchema[]): Promise<ProviderReply> {
    let res: Response
    try {
      res = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // El system prompt lo fija el servidor; el cliente solo elige nombres de herramientas.
        body: JSON.stringify({ messages, tools: tools.map((t) => t.name) })
      })
    } catch {
      throw new KaizerError('No pude conectar con el servidor de la demo. Revisa tu conexión.')
    }
    type Body = Partial<ProviderReply> & { error?: string }
    const data = await (res.json() as Promise<Body>).catch((): Body | null => null)
    if (!res.ok) throw new KaizerError(data?.error ?? 'La demo no está disponible ahora mismo. Inténtalo más tarde.')
    if (!data) throw new KaizerError('La demo devolvió una respuesta inválida.')
    return { text: data.text ?? '', toolCalls: data.toolCalls ?? [], raw: data.raw }
  }
}
