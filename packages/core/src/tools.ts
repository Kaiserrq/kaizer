import type { ToolSchema } from './types'

/** Herramientas que se pueden programar (acciones concretas, sin gestión de tareas). */
export const SCHEDULABLE_TOOLS = [
  'open_url',
  'youtube_latest',
  'web_search',
  'open_app',
  'system_control',
  'send_whatsapp'
] as const

export const SYSTEM_ACTIONS = [
  'volume_up',
  'volume_down',
  'mute',
  'play_pause',
  'next',
  'previous',
  'lock'
] as const

/** Único lugar donde se definen las herramientas. Los ejecutores los pone cada plataforma. */
export const TOOL_SCHEMAS: ToolSchema[] = [
  {
    name: 'open_url',
    description: 'Abre una dirección web (http o https) en el navegador.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Dirección completa, por ejemplo https://github.com' },
        browser: {
          type: 'string',
          enum: ['brave', 'default'],
          description: 'Opcional. Si no se indica, se usa el navegador preferido del usuario.'
        }
      },
      required: ['url']
    }
  },
  {
    name: 'youtube_latest',
    description:
      'Abre el video más reciente de un canal de YouTube. Acepta el nombre, un alias guardado, el handle (@canal) o la URL del canal.',
    parameters: {
      type: 'object',
      properties: { channel: { type: 'string', description: 'Nombre, alias o @handle del canal.' } },
      required: ['channel']
    }
  },
  {
    name: 'web_search',
    description: 'Busca algo en la web con el navegador preferido.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Texto a buscar.' } },
      required: ['query']
    }
  },
  {
    name: 'open_app',
    description: 'Abre una aplicación instalada en la PC por su nombre (por ejemplo Spotify, Word, Calculadora).',
    parameters: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Nombre de la aplicación.' } },
      required: ['name']
    }
  },
  {
    name: 'system_control',
    description: 'Controla el sistema: volumen, reproducción multimedia o bloqueo de pantalla.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: [...SYSTEM_ACTIONS], description: 'Acción a ejecutar.' }
      },
      required: ['action']
    }
  },
  {
    name: 'send_whatsapp',
    description:
      'Envía un mensaje de WhatsApp. El contacto puede ser un nombre o alias de la agenda ("mamá") o un número con código de país.',
    parameters: {
      type: 'object',
      properties: {
        contact: { type: 'string', description: 'Nombre, alias o número del destinatario.' },
        message: { type: 'string', description: 'Texto del mensaje.' }
      },
      required: ['contact', 'message']
    }
  },
  {
    name: 'schedule_task',
    description:
      'Programa una acción para más tarde. Guarda la herramienta y sus argumentos ya resueltos; no se vuelve a consultar al modelo al ejecutarla.',
    parameters: {
      type: 'object',
      properties: {
        when: {
          type: 'string',
          description: 'Fecha y hora local en formato YYYY-MM-DDTHH:mm, calculada con la fecha actual del sistema.'
        },
        tool: { type: 'string', enum: [...SCHEDULABLE_TOOLS], description: 'Herramienta a ejecutar.' },
        args: { type: 'object', description: 'Argumentos de esa herramienta, tal como los recibiría normalmente.' },
        repeat: { type: 'string', enum: ['none', 'daily', 'weekly'], description: 'Repetición. Por defecto none.' }
      },
      required: ['when', 'tool', 'args']
    }
  },
  {
    name: 'list_tasks',
    description: 'Lista las tareas programadas con su identificador.',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'cancel_task',
    description: 'Cancela una tarea programada por su identificador.',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Identificador de la tarea (de list_tasks).' } },
      required: ['id']
    }
  },
  {
    name: 'remember',
    description:
      'Guarda un dato en la memoria local. Para alias de canales de YouTube usa la clave "canal:<alias>" y como valor el @handle.',
    parameters: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Nombre del dato.' },
        value: { type: 'string', description: 'Valor a recordar.' }
      },
      required: ['key', 'value']
    }
  },
  {
    name: 'recall',
    description: 'Busca en la memoria local datos guardados que coincidan con la consulta.',
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Palabra o frase a buscar.' } },
      required: ['query']
    }
  },
  {
    name: 'add_contact',
    description: 'Agrega o actualiza un contacto en la agenda local (nombre y teléfono con código de país).',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nombre o alias del contacto.' },
        phone: { type: 'string', description: 'Teléfono con código de país, por ejemplo +521234567890.' }
      },
      required: ['name', 'phone']
    }
  }
]

/** Solo para la demo web: avisa de que la petición necesita la app instalada. */
export const REQUIRES_DESKTOP_SCHEMA: ToolSchema = {
  name: 'requires_desktop',
  description:
    'Úsala cuando el usuario pida algo local que la web no puede hacer: abrir programas, controlar la PC, enviar WhatsApp o programar tareas.',
  parameters: {
    type: 'object',
    properties: { feature: { type: 'string', description: 'Función pedida, en pocas palabras.' } },
    required: ['feature']
  }
}

export const WEB_TOOL_NAMES = ['open_url', 'youtube_latest', 'web_search', 'remember', 'recall', 'requires_desktop'] as const

/** Herramientas ofrecidas en la web (sin las exclusivas de desktop). */
export function webToolSchemas(): ToolSchema[] {
  const base = TOOL_SCHEMAS.filter((t) => (WEB_TOOL_NAMES as readonly string[]).includes(t.name)).map((t) => {
    if (t.name !== 'open_url') return t
    const { browser: _browser, ...props } = t.parameters.properties ?? {}
    return { ...t, parameters: { ...t.parameters, properties: props } }
  })
  return [...base, REQUIRES_DESKTOP_SCHEMA]
}
