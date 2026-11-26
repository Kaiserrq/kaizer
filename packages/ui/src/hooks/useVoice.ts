import { useCallback, useEffect, useRef, useState } from 'react'

export interface VoiceOptions {
  transcribe(blob: Blob): Promise<string>
  onText(text: string): void
  onError(message: string): void
  /** Reconocimiento propio de la plataforma (web). Sustituye a grabar + transcribir. */
  listen?: () => { stop(): void; result: Promise<string> }
}

const MAX_MS = 30_000
const SILENCE_MS = 1600
const NO_VOICE_MS = 8000

export function useVoice(opts: VoiceOptions) {
  const optsRef = useRef(opts)
  optsRef.current = opts
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  /** Amplitud suavizada del micrófono (0 a 1), leída por el núcleo en cada frame. */
  const levelRef = useRef(0)
  const stopRef = useRef<(() => void) | null>(null)

  const stop = useCallback(() => stopRef.current?.(), [])

  const start = useCallback(async () => {
    if (stopRef.current) return
    window.speechSynthesis?.cancel()
    const listen = optsRef.current.listen
    if (listen) {
      let session: ReturnType<typeof listen>
      try {
        session = listen()
      } catch (e) {
        optsRef.current.onError(e instanceof Error ? e.message : String(e))
        return
      }
      const t0 = performance.now()
      let raf = 0
      // El navegador no expone el nivel del micrófono: se simula un pulso suave para el núcleo.
      const pulse = (): void => {
        levelRef.current = 0.35 + 0.25 * Math.sin((performance.now() - t0) / 140)
        raf = requestAnimationFrame(pulse)
      }
      stopRef.current = () => session.stop()
      setRecording(true)
      pulse()
      session.result
        .then((text) => {
          if (text.trim()) optsRef.current.onText(text.trim())
          else optsRef.current.onError('No escuché nada. Acércate al micrófono e inténtalo de nuevo.')
        })
        .catch((e: unknown) => optsRef.current.onError(e instanceof Error ? e.message : String(e)))
        .finally(() => {
          cancelAnimationFrame(raf)
          levelRef.current = 0
          stopRef.current = null
          setRecording(false)
        })
      return
    }
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
    } catch (e) {
      const name = (e as { name?: string }).name
      optsRef.current.onError(
        name === 'NotFoundError'
          ? 'No encuentro un micrófono. Conecta uno e inténtalo de nuevo.'
          : 'KAIZER no tiene permiso para usar el micrófono. Actívalo en Configuración de Windows, en Privacidad y seguridad, Micrófono.'
      )
      return
    }
    const ctx = new AudioContext()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 1024
    ctx.createMediaStreamSource(stream).connect(analyser)
    const buf = new Uint8Array(analyser.fftSize)
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : ''
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
    const chunks: Blob[] = []
    let raf = 0
    let heard = false
    const startedAt = performance.now()
    let lastVoice = startedAt

    mr.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data)
    }
    mr.onstop = () => {
      cancelAnimationFrame(raf)
      stream.getTracks().forEach((t) => t.stop())
      void ctx.close()
      levelRef.current = 0
      stopRef.current = null
      setRecording(false)
      if (!heard) {
        optsRef.current.onError('No escuché nada. Acércate al micrófono e inténtalo de nuevo.')
        return
      }
      setTranscribing(true)
      optsRef.current
        .transcribe(new Blob(chunks, { type: mr.mimeType || 'audio/webm' }))
        .then((text) => {
          if (text.trim()) optsRef.current.onText(text.trim())
          else optsRef.current.onError('No pude entender el audio. Habla un poco más cerca e inténtalo de nuevo.')
        })
        .catch((e: unknown) => optsRef.current.onError(e instanceof Error ? e.message : String(e)))
        .finally(() => setTranscribing(false))
    }

    const halt = (): void => {
      if (mr.state !== 'inactive') mr.stop()
    }
    stopRef.current = halt

    const loop = (): void => {
      analyser.getByteTimeDomainData(buf)
      let sum = 0
      for (const v of buf) {
        const x = (v - 128) / 128
        sum += x * x
      }
      const rms = Math.sqrt(sum / buf.length)
      levelRef.current = levelRef.current * 0.6 + Math.min(1, rms * 5) * 0.4
      const now = performance.now()
      if (rms > 0.02) {
        heard = true
        lastVoice = now
      }
      if ((heard && now - lastVoice > SILENCE_MS) || (!heard && now - startedAt > NO_VOICE_MS) || now - startedAt > MAX_MS) {
        halt()
      } else {
        raf = requestAnimationFrame(loop)
      }
    }
    mr.start()
    setRecording(true)
    loop()
  }, [])

  const toggle = useCallback(() => {
    if (stopRef.current) stop()
    else void start()
  }, [start, stop])

  const speak = useCallback((text: string) => {
    const synth = window.speechSynthesis
    if (!synth) return
    synth.cancel()
    const clean = text.replace(/[*_`#>]/g, '').trim()
    if (!clean) return
    const u = new SpeechSynthesisUtterance(clean)
    const voices = synth.getVoices()
    const voice =
      voices.find((v) => /^es-(MX|US)/i.test(v.lang)) ?? voices.find((v) => /^es/i.test(v.lang))
    if (voice) {
      u.voice = voice
      u.lang = voice.lang
    } else {
      u.lang = 'es-ES'
    }
    u.onstart = () => setSpeaking(true)
    u.onend = () => setSpeaking(false)
    u.onerror = () => setSpeaking(false)
    synth.speak(u)
  }, [])

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis?.cancel()
    setSpeaking(false)
  }, [])

  useEffect(
    () => () => {
      stopRef.current?.()
      window.speechSynthesis?.cancel()
    },
    []
  )

  return { recording, transcribing, speaking, levelRef, toggle, speak, stopSpeaking }
}
