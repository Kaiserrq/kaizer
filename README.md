# KAIZER

Asistente personal para Windows con voz. Abre programas y páginas, pone el último video de un canal, envía WhatsApp, controla el volumen y programa tareas. Habla o escribe, y lo hace.

La memoria, los contactos y la API key de Gemini se quedan en tu equipo: no hay cuentas ni servidor propio. Hay además una demo web limitada (solo abre pestañas y busca) para probarlo sin instalar.

## Qué puede hacer

- Abrir apps instaladas, URLs y búsquedas (Brave o el navegador por defecto).
- Reproducir el último video de un canal de YouTube.
- Enviar WhatsApp a contactos y alias ("mamá").
- Programar tareas ("a las 12 envíale a mamá: ya llegué"), con repetición diaria o semanal.
- Control del sistema: volumen, multimedia, bloqueo.
- Voz de entrada y salida, y memoria local.

## Arquitectura

```
kaizer/
├─ packages/
│  ├─ core/    agente (bucle LLM + herramientas), proveedor Gemini, esquemas de herramientas
│  └─ ui/      React compartido: núcleo animado, chat, ajustes; PlatformAdapter por plataforma
├─ apps/
│  ├─ desktop/ Electron + electron-vite: herramientas que controlan la PC, WhatsApp, scheduler
│  └─ web/     Vite + React: landing, demo (/demo) y función de Netlify /api/chat
└─ netlify.toml
```

`core` y `ui` son agnósticos de plataforma: cada app aporta sus herramientas y un adaptador. En la web, el navegador ejecuta el bucle de herramientas y la función de Netlify hace una llamada a Gemini por petición, con la key en el servidor.

## Stack

TypeScript, React 19, Electron, Vite, npm workspaces, Gemini (`@google/genai`), Baileys, Netlify Functions y Netlify Blobs.

## Cómo correrlo

```bash
npm install
npm run dev:desktop     # app de escritorio
npm run dev:web         # landing + demo en http://localhost:5174
npm run typecheck
npm run build           # typecheck + build de desktop y web
npm run dist            # instalador NSIS en apps/desktop/release
```

Para la demo en local copia `apps/web/.env.example` a `apps/web/.env.local` y pon tu `GEMINI_API_KEY`. No necesitas netlify-cli: Vite monta la función en `/api/chat`.

## API key de Gemini

- App de escritorio: Ajustes, campo "API key de Gemini". Se guarda cifrada en tu equipo. Consíguela gratis en aistudio.google.com/apikey.
- Netlify: define la variable de entorno `GEMINI_API_KEY` en el sitio. La demo limita las peticiones por IP y día.

Las URLs de descarga (instalador y APK) y del repositorio se editan en `apps/web/src/config.ts`.

## Aviso sobre WhatsApp

El envío usa Baileys, una librería no oficial que se conecta como dispositivo vinculado. No está respaldada por WhatsApp y su uso puede incumplir sus términos o llevar a la suspensión de la cuenta. Úsalo bajo tu propia responsabilidad.

## Roadmap

- Android (Capacitor) reutilizando `packages/ui`.
