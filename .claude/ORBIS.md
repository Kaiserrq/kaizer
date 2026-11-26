# ORBIS — KAIZER

## Qué es
Asistente virtual personal (estilo JARVIS, identidad propia) para portafolio/GitHub. Controla la PC (Brave, YouTube, apps, sistema), envía WhatsApp, ejecuta tareas programadas, voz. Público, sin usuarios, memoria local por equipo. Solo Gemini: sin Ollama ni modelos locales.

## Estructura (npm workspaces; core y ui exportan TS fuente, electron-vite los empaqueta)
- `packages/core`: `shared.ts` (tipos/Settings), `tools.ts` (esquemas únicos), `agent.ts` (bucle, máx. 5 rondas), `providers/gemini.ts` (`LLMProvider` + transcripción), `prompt.ts`. Import ligero para UI: `@kaizer/core/shared`.
- `packages/ui`: React compartido. `adapter.ts` = `PlatformAdapter` (interfaz que implementa cada plataforma); `ForgeCore` (canvas), `Chat`, `SettingsPanel`, `hooks/useVoice`, `styles.css` (tokens).
- `apps/desktop`: Electron + electron-vite. `src/main` (executors, scheduler, whatsapp, settings, memory, ipc, tray), `src/preload` (API tipada en `window.kaizer`, tipos en `src/shared/api.ts`), `src/renderer` (adaptador + conversión a WAV).
- `apps/web`: Vite+React → Netlify. `/` landing (`src/landing`, núcleo vía `@kaizer/ui/forge`, sin CSS global de ui), `/demo` = `@kaizer/ui` + `webAdapter.ts` (SpeechRecognition, `webTools.ts`, `ProxyProvider`). `netlify/lib/chat-core.ts` = handler de `/api/chat` (modelo fijo, límites, rate limit por IP con Blobs o memoria); `netlify/functions/chat.ts` lo expone. URLs de descarga en `src/config.ts`. El cliente solo envía nombres de herramientas; el servidor pone schemas y system prompt (variante `web` en core, tool `requires_desktop`).
- Plan: `docs/PLAN-FASE1.md`.

## Cómo correr
- `npm install` en la raíz (scripts aprobados en `allowScripts` del package.json raíz; si Electron no baja: `node node_modules/electron/install.js`).
- `npm run dev:desktop` | `npm run typecheck` | `npm run build` | `npm run dist` (NSIS en `apps/desktop/release`).
- `npm run dev:web` (puerto 5174; middleware de Vite sirve `/api/chat`; key en `apps/web/.env.local`, ver `.env.example`). Netlify: `netlify.toml` en la raíz, variable `GEMINI_API_KEY`.

## Decisiones
- Memoria/contactos/tareas/ajustes en JSON en userData. API key cifrada con safeStorage (`apikey.bin`). Nunca se versiona.
- WhatsApp: Baileys 7 (ESM, import dinámico), sesión en `userData/whatsapp-auth`, QR en Ajustes.
- Tareas guardan herramienta+args resueltos; el scheduler revisa cada 15 s y al arrancar ejecuta las vencidas.
- Voz: MediaRecorder → WAV 16 kHz en el renderer → Gemini (audio inline). TTS con speechSynthesis es-*.
- Ventana sin marco, cerrar = bandeja, Ctrl+Espacio, `--hidden` al iniciar con Windows (solo si está empaquetado).
- Diseño: pizarra #1B2631, brasa #FF7A2F, latón #D4A853; Unbounded (marca) + Hanken Grotesk locales.

## Entorno del dueño
Windows 11, i7-1165G7, 16 GB, sin GPU. Brave en Program Files. Node 24. JDK 17 (Microsoft OpenJDK, JAVA_HOME de usuario) + Android SDK por CLI en %LOCALAPPDATA%\Android\Sdk (ANDROID_HOME; platforms/android-36, build-tools/36.0.0; el sdkmanager se sustituyó por `cmdline-tools\latest\bin\android.exe sdk install <pkg/ver>`). Sin Android Studio. gh CLI instalado.

## Pendientes
- Probar con API key real: agente, transcripción, WhatsApp (QR), tareas, `npm run dist` (no se ejecutó).
- `safeStorage.isEncryptionAvailable` está deprecado en Electron 45 (migrar a la variante async).
- Instalador sin icono .ico propio (se usa icon.png 256 generado).
- Web: poner URLs reales en `apps/web/src/config.ts`, subir `kaizer.apk` a `public/downloads`, probar la demo con key real y desplegar. `window.open` tras la respuesta del LLM puede bloquearse por popups (se avisa en el chat).
- Fase 2: APK Android (Capacitor).
