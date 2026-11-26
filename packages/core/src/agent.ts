import { buildSystemPrompt } from './prompt'
import type { PromptVariant } from './prompt'
import { TOOL_SCHEMAS } from './tools'
import type { ActionRecord, AgentProgress, AgentResult, ChatTurn } from './shared'
import type { ChatMessage, LLMProvider, ToolExecutors, ToolSchema } from './types'

export const MAX_TOOL_ROUNDS = 5

export interface RunAgentOptions {
  provider: LLMProvider
  executors: ToolExecutors
  history: ChatTurn[]
  userText: string
  onProgress?: (p: AgentProgress) => void
  tools?: ToolSchema[]
  now?: Date
  /** Variante del system prompt. Por defecto desktop. */
  variant?: PromptVariant
}

/** Bucle del agente: modelo, herramientas, modelo... hasta 5 rondas de herramientas. */
export async function runAgent(opts: RunAgentOptions): Promise<AgentResult> {
  const tools = (opts.tools ?? TOOL_SCHEMAS).filter((t) => opts.executors[t.name])
  const system = buildSystemPrompt(opts.now, opts.variant)
  const messages: ChatMessage[] = [
    ...opts.history.map<ChatMessage>((h) =>
      h.role === 'user' ? { role: 'user', content: h.text } : { role: 'assistant', content: h.text }
    ),
    { role: 'user', content: opts.userText }
  ]
  const actions: ActionRecord[] = []

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const reply = await opts.provider.chat(system, messages, tools)
    if (reply.toolCalls.length === 0) return { reply: reply.text, actions }

    messages.push({ role: 'assistant', content: reply.text, toolCalls: reply.toolCalls, raw: reply.raw })
    for (const call of reply.toolCalls) {
      opts.onProgress?.({ type: 'tool-start', tool: call.name })
      const exec = opts.executors[call.name]
      let ok = false
      let summary: string
      let data: unknown
      if (!exec) {
        summary = `La herramienta ${call.name} no está disponible en esta plataforma.`
      } else {
        try {
          const r = await exec(call.args)
          ok = r.ok
          summary = r.summary
          data = r.data
        } catch (e) {
          summary = e instanceof Error ? e.message : String(e)
        }
      }
      const action: ActionRecord = { tool: call.name, args: call.args, ok, summary, ...(data !== undefined ? { data } : {}) }
      actions.push(action)
      opts.onProgress?.({ type: 'action', action })
      messages.push({
        role: 'tool',
        name: call.name,
        callId: call.id,
        content: JSON.stringify({ ok, resultado: summary, ...(data !== undefined ? { datos: data } : {}) })
      })
    }
  }

  // Límite de rondas alcanzado: pide un cierre sin más herramientas.
  const last = await opts.provider.chat(system, messages, [])
  return {
    reply: last.text || 'Terminé las acciones pedidas.',
    actions
  }
}
