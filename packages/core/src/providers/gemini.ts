import { GoogleGenAI } from '@google/genai'
import type { Content, Part } from '@google/genai'
import { KaizerError } from '../shared'
import type { ChatMessage, LLMProvider, ProviderReply, ToolCall, ToolSchema } from '../types'

export interface GeminiConfig {
  apiKey: string
  model: string
}

function mapGeminiError(e: unknown): KaizerError {
  if (e instanceof KaizerError) return e
  const msg = e instanceof Error ? e.message : String(e)
  const status = (e as { status?: number } | null)?.status
  if (status === 400 && /API key|API_KEY/i.test(msg)) {
    return new KaizerError('Gemini rechazó tu API key. Revísala en Ajustes y vuelve a guardarla.')
  }
  if (status === 401 || status === 403) {
    return new KaizerError('Gemini rechazó tu API key. Revísala en Ajustes y vuelve a guardarla.')
  }
  if (status === 404) {
    return new KaizerError('Gemini no encontró ese modelo. Cambia el modelo en Ajustes (por ejemplo gemini-3.8-flash).')
  }
  if (status === 429) {
    return new KaizerError('Gemini alcanzó su límite de uso. Espera un minuto e inténtalo de nuevo, o cambia de modelo en Ajustes.')
  }
  if (status && status >= 500) {
    return new KaizerError('Gemini no está disponible ahora mismo. Inténtalo de nuevo en unos minutos.')
  }
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network/i.test(msg)) {
    return new KaizerError('No pude conectar con Gemini. Revisa tu conexión a internet.')
  }
  return new KaizerError(`Gemini devolvió un error: ${msg.slice(0, 200)}`)
}

function toContents(messages: ChatMessage[]): Content[] {
  const contents: Content[] = []
  for (const m of messages) {
    if (m.role === 'user') {
      contents.push({ role: 'user', parts: [{ text: m.content }] })
    } else if (m.role === 'assistant') {
      if (m.raw) {
        contents.push(m.raw as Content)
      } else {
        const parts: Part[] = []
        if (m.content) parts.push({ text: m.content })
        for (const c of m.toolCalls ?? []) parts.push({ functionCall: { name: c.name, args: c.args } })
        contents.push({ role: 'model', parts })
      }
    } else {
      const part: Part = { functionResponse: { name: m.name, response: { output: m.content } } }
      const last = contents[contents.length - 1]
      if (last && last.role === 'user' && last.parts?.every((p) => p.functionResponse)) {
        last.parts.push(part)
      } else {
        contents.push({ role: 'user', parts: [part] })
      }
    }
  }
  return contents
}

export class GeminiProvider implements LLMProvider {
  private ai: GoogleGenAI
  constructor(private cfg: GeminiConfig) {
    if (!cfg.apiKey) throw new KaizerError('Falta tu API key de Gemini. Agrégala en Ajustes.')
    this.ai = new GoogleGenAI({ apiKey: cfg.apiKey })
  }

  async chat(system: string, messages: ChatMessage[], tools: ToolSchema[]): Promise<ProviderReply> {
    try {
      const res = await this.ai.models.generateContent({
        model: this.cfg.model,
        contents: toContents(messages),
        config: {
          systemInstruction: system,
          ...(tools.length
            ? {
                tools: [
                  {
                    functionDeclarations: tools.map((t) => ({
                      name: t.name,
                      description: t.description,
                      parametersJsonSchema: t.parameters
                    }))
                  }
                ]
              }
            : {})
        }
      })
      const content = res.candidates?.[0]?.content
      const parts = content?.parts ?? []
      const text = parts
        .filter((p) => typeof p.text === 'string' && !p.thought)
        .map((p) => p.text)
        .join('')
        .trim()
      const toolCalls: ToolCall[] = parts
        .filter((p) => p.functionCall)
        .map((p) => ({
          id: p.functionCall?.id,
          name: p.functionCall?.name ?? '',
          args: (p.functionCall?.args ?? {}) as Record<string, unknown>
        }))
      if (!text && toolCalls.length === 0) {
        throw new KaizerError('Gemini no devolvió respuesta. Reformula la petición e inténtalo otra vez.')
      }
      return { text, toolCalls, raw: content }
    } catch (e) {
      throw mapGeminiError(e)
    }
  }
}

/** Transcribe audio con Gemini (audio inline en base64). */
export async function transcribeWithGemini(
  cfg: GeminiConfig,
  audio: { base64: string; mimeType: string }
): Promise<string> {
  if (!cfg.apiKey) throw new KaizerError('Falta tu API key de Gemini. Agrégala en Ajustes.')
  try {
    const ai = new GoogleGenAI({ apiKey: cfg.apiKey })
    const res = await ai.models.generateContent({
      model: cfg.model,
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType: audio.mimeType, data: audio.base64 } },
            {
              text: 'Transcribe este audio en español. Devuelve solo el texto dicho, sin comillas ni comentarios. Si no hay voz, devuelve una cadena vacía.'
            }
          ]
        }
      ]
    })
    return (res.text ?? '').trim()
  } catch (e) {
    throw mapGeminiError(e)
  }
}
