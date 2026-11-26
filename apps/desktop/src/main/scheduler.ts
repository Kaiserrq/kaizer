import { randomUUID } from 'node:crypto'
import type { RepeatMode, Task, ToolResult } from '@kaizer/core'
import { dataPath, readJson, writeJson } from './store'

type Runner = (tool: string, args: Record<string, unknown>) => Promise<ToolResult>

export const MAX_ATTEMPTS = 3
const RETRY_MS = 60_000
const PAST_TOLERANCE_MS = 60_000

const pad = (n: number): string => String(n).padStart(2, '0')
const toLocalIso = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`

/** Avanza por días de calendario locales, así el cambio de horario no corre la hora. */
function nextOccurrence(when: string, repeat: RepeatMode, now: number): string {
  const d = new Date(when)
  const step = repeat === 'weekly' ? 7 : 1
  while (d.getTime() <= now) d.setDate(d.getDate() + step)
  return toLocalIso(d)
}

export class Scheduler {
  private tasks: Task[] = []
  private timer: ReturnType<typeof setInterval> | null = null
  private running = false

  constructor(
    private runTool: Runner,
    private onChange: (tasks: Task[]) => void,
    /** `final` es true cuando la tarea terminó (éxito) o agotó sus reintentos. */
    private onRan: (task: Task, result: ToolResult) => void
  ) {}

  private file(): string {
    return dataPath('tasks.json')
  }

  private save(): void {
    writeJson(this.file(), this.tasks)
    this.onChange(this.list())
  }

  private has(id: string): Task | undefined {
    return this.tasks.find((t) => t.id === id)
  }

  /** Recarga las tareas guardadas y ejecuta las que ya vencieron. */
  start(): void {
    this.tasks = readJson<Task[]>(this.file(), [])
    void this.tick()
    this.timer = setInterval(() => void this.tick(), 15_000)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
  }

  list(): Task[] {
    return [...this.tasks].sort((a, b) => a.when.localeCompare(b.when))
  }

  add(input: { when: string; tool: string; args: Record<string, unknown>; repeat: RepeatMode; description: string }): Task {
    const date = new Date(input.when)
    if (Number.isNaN(date.getTime())) {
      throw new Error('La fecha de la tarea no es válida. Usa el formato AAAA-MM-DDTHH:mm.')
    }
    if (date.getTime() < Date.now() - PAST_TOLERANCE_MS) {
      throw new Error('La hora indicada ya pasó. Pide al usuario que confirme la fecha y la hora.')
    }
    const task: Task = {
      id: randomUUID().slice(0, 8),
      ...input,
      when: toLocalIso(date),
      createdAt: new Date().toISOString()
    }
    this.tasks.push(task)
    this.save()
    return task
  }

  cancel(id: string): boolean {
    const before = this.tasks.length
    this.tasks = this.tasks.filter((t) => t.id !== id)
    if (this.tasks.length === before) return false
    this.save()
    return true
  }

  private async tick(): Promise<void> {
    if (this.running) return
    this.running = true
    try {
      const now = Date.now()
      const due = this.tasks.filter(
        (t) => !t.failed && new Date(t.retryAt ?? t.when).getTime() <= now
      )
      for (const snapshot of due) {
        if (!this.has(snapshot.id)) continue // cancelada mientras tanto
        let result: ToolResult
        try {
          result = await this.runTool(snapshot.tool, snapshot.args)
        } catch (e) {
          result = { ok: false, summary: e instanceof Error ? e.message : String(e) }
        }
        const task = this.has(snapshot.id)
        if (!task) continue // cancelada durante la ejecución: no se reprograma

        if (result.ok) {
          task.attempts = 0
          task.retryAt = undefined
          task.lastError = undefined
          task.lastRun = new Date().toISOString()
          if (task.repeat === 'none') this.tasks = this.tasks.filter((t) => t.id !== task.id)
          else task.when = nextOccurrence(task.when, task.repeat, Date.now())
          this.save()
          this.onRan(task, result)
        } else {
          task.attempts = (task.attempts ?? 0) + 1
          task.lastError = result.summary
          if (task.attempts >= MAX_ATTEMPTS) {
            task.failed = true
            task.retryAt = undefined
            this.save()
            this.onRan(task, result)
          } else {
            task.retryAt = new Date(Date.now() + RETRY_MS).toISOString()
            this.save()
          }
        }
      }
    } finally {
      this.running = false
    }
  }
}
