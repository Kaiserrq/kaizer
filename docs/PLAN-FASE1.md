# KAIZER — Plan Fase 1 (Windows + demo web)

Asistente personal de escritorio. Público, sin usuarios ni nube: cada equipo guarda su propia memoria.
Objetivo: proyecto de portafolio que funcione perfecto en una demo en vivo.

## Stack
- Monorepo con **npm workspaces**, TypeScript estricto.
- `packages/core`: agente (bucle LLM + herramientas), agnóstico de plataforma. Las herramientas se inyectan.
- `packages/ui`: UI React compartida (núcleo animado, chat, ajustes). La reutilizan desktop, web y luego Android (Capacitor, fase 2).
- `apps/desktop`: **Electron + electron-vite + React**. Aquí viven las herramientas que controlan la PC (proceso main).
- `apps/web`: landing + demo web (Vite + React) para **Netlify**.
- Sin módulos nativos que requieran compilación (nada de better-sqlite3): la memoria va en archivos JSON dentro de `app.getPath('userData')`.

## Cerebro (proveedor LLM) — `packages/core/src/providers`
- Interfaz `LLMProvider.chat(system, messages, tools) -> { text, toolCalls }` con una sola implementación (Gemini); la interfaz se mantiene para poder cambiar de proveedor más adelante.
- **Gemini** (por defecto) con `@google/genai`, function calling. Modelo configurable (por defecto `gemini-2.5-flash`).
- Sin dependencias externas: no hay Ollama ni modelos locales.
- Bucle del agente: máx. 5 rondas de herramientas por petición; system prompt en español, personalidad KAIZER (sobrio, preciso, respuestas cortas, trata al usuario de "tú").
- La API key la escribe el usuario en Ajustes; en desktop se cifra con `safeStorage`. Nunca se versiona.

## Herramientas (desktop, proceso main, expuestas por IPC tipado vía preload)
| Herramienta | Qué hace |
|---|---|
| `open_url(url, browser?)` | Abre en Brave (detecta `C:\Program Files\BraveSoftware\...` y `%LOCALAPPDATA%\BraveSoftware\...`), o en el navegador por defecto. Navegador preferido configurable. |
| `youtube_latest(channel)` | Resuelve el canal: alias guardado en memoria → handle `@x` → descarga la página del canal, extrae `channelId`, lee el RSS `feeds/videos.xml?channel_id=` y abre el video más reciente. Si falla: abre la búsqueda de YouTube ordenada por fecha. |
| `web_search(query)` | Abre la búsqueda en el navegador preferido. |
| `open_app(name)` | Busca accesos `.lnk` en ambos Start Menu (ProgramData y AppData) con coincidencia difusa y los abre con `shell.openPath`. |
| `system_control(action)` | volumen +/–, silenciar, play/pausa, siguiente, bloquear pantalla (PowerShell / teclas multimedia). |
| `send_whatsapp(contact, message)` | **Baileys** (`@whiskeysockets/baileys`, sin navegador). Se vincula escaneando un QR en Ajustes; la sesión se guarda en userData. El contacto se resuelve por alias de memoria ("mamá" → número). |
| `schedule_task(when, tool, args, repeat?)` | Guarda la tarea **ya resuelta** (herramienta + argumentos) y la ejecuta a la hora indicada sin volver a llamar al LLM. Repetición: ninguna, diaria, semanal. |
| `list_tasks` / `cancel_task(id)` | Gestionar tareas. |
| `remember(key, value)` / `recall(query)` | Memoria local: datos, alias de canales y contactos. |
| `add_contact(name, phone)` | Agenda local. |

Ejecución en segundo plano: icono en la bandeja, cerrar = minimizar a la bandeja, opción "Iniciar con Windows" (`setLoginItemSettings`), atajo global **Ctrl+Espacio** para hablar. Notificación nativa cuando una tarea programada se ejecuta.

## Voz
- La SpeechRecognition web **no funciona en Electron**. Se graba con MediaRecorder:
  - El audio (convertido a WAV 16 kHz) se envía a Gemini para transcribirlo.
- TTS: `speechSynthesis` con la voz en español disponible en Windows; se puede desactivar.
- Web demo: SpeechRecognition del navegador.
- El nivel del micrófono (AnalyserNode) alimenta la animación del núcleo.

## Diseño (tokens)
- Colores: pizarra `#1B2631` (fondo), acero `#243341` (superficies), niebla `#93A4B3` (texto secundario), marfil `#EDF1F4` (texto), brasa `#FF7A2F` (núcleo / estado activo), latón `#D4A853` (tareas programadas / acciones ejecutadas). Error: `#E5484D`.
- Tipografía (locales con @fontsource, sin CDN): **Unbounded** solo para la marca y la palabra de estado del núcleo; **Hanken Grotesk** para todo lo demás. Sentence case, sin etiquetas en mayúsculas ni eyebrows.
- Lo memorable es **el núcleo (forja)**: canvas con anillo exterior segmentado (corona de 12 segmentos), anillo medio de latón y un centro de brasa. Estados:
  - reposo: brasa respirando lento;
  - escuchando: los segmentos se abren según la amplitud del micrófono;
  - pensando: la corona gira;
  - hablando: el centro pulsa;
  - ejecutando: el anillo de latón avanza.
- El resto es mate y plano: sin sombras genéricas, sin tarjetas idénticas, sin gradientes decorativos. Las acciones ejecutadas aparecen en el chat como una fila compacta con borde latón ("Abrí Brave con el último video de HH").
- Respeta `prefers-reduced-motion` y el foco visible por teclado.
- Layout escritorio: núcleo a la izquierda (≈40%) con estado y tareas de hoy debajo; conversación a la derecha con el campo de texto y el micrófono abajo. Ventana sin marco, con barra propia (minimizar, cerrar).
- Layout móvil/web estrecho: núcleo arriba, conversación debajo, campo de texto fijo abajo.

## Demo web (Netlify)
- Landing: el núcleo en vivo como hero, qué hace KAIZER, botón para descargar el instalador (GitHub Releases) y enlace a GitHub.
- Ruta `/demo`: la misma UI con Gemini y la key del visitante (guardada en localStorage). Herramientas web: `open_url` (pestaña nueva), `web_search`, `youtube_latest` (búsqueda por fecha, por CORS), memoria en localStorage. Aviso claro: "En la web KAIZER no controla tu PC. Descarga la app para eso."
- `netlify.toml` en la raíz que construya `apps/web`.

## Empaquetado
- `electron-builder` → instalador NSIS para Windows (`npm run dist`).

## Fase 2 (después, no ahora)
Android con Capacitor reutilizando `packages/ui`. Requiere Android Studio + JDK 17.
