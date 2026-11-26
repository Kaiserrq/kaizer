export interface ToolCall {
  id?: string
  name: string
  args: Record<string, unknown>
}

export type ChatMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[]; raw?: unknown }
  | { role: 'tool'; name: string; content: string; callId?: string }

export interface JsonSchema {
  type: string
  description?: string
  properties?: Record<string, JsonSchema>
  required?: string[]
  enum?: string[]
  items?: JsonSchema
  additionalProperties?: boolean
}

export interface ToolSchema {
  name: string
  description: string
  parameters: JsonSchema
}

export interface ProviderReply {
  text: string
  toolCalls: ToolCall[]
  /** Dato propio del proveedor que debe reenviarse tal cual en la ronda siguiente. */
  raw?: unknown
}

export interface LLMProvider {
  chat(system: string, messages: ChatMessage[], tools: ToolSchema[]): Promise<ProviderReply>
}

export interface ToolResult {
  ok: boolean
  /** Frase corta en español: lo que se hizo (o por qué falló). */
  summary: string
  data?: unknown
}

export type ToolExecutor = (args: Record<string, unknown>) => Promise<ToolResult>
export type ToolExecutors = Partial<Record<string, ToolExecutor>>
