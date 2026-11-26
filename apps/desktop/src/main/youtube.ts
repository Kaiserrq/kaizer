import { getMemory, normalize } from './memory'

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
const HEADERS = { 'User-Agent': UA, 'Accept-Language': 'es', Cookie: 'CONSENT=YES+1; SOCS=CAI' }

export interface LatestVideo {
  channel: string
  title: string
  url: string
}

export const youtubeSearchUrl = (q: string): string =>
  `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=CAI%253D`

async function getText(url: string): Promise<string> {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

function channelPageUrl(input: string): string | null {
  const s = input.trim()
  if (/^https?:\/\//i.test(s)) return /youtube\.com/i.test(s) ? s : null
  if (s.startsWith('@')) return `https://www.youtube.com/${s}`
  if (/^UC[\w-]{22}$/.test(s)) return `https://www.youtube.com/channel/${s}`
  return null
}

/** Resuelve el canal (alias de memoria, @handle, URL, nombre) y devuelve su video más reciente. */
export async function latestVideo(channelInput: string): Promise<LatestVideo> {
  const alias = getMemory(`canal:${channelInput}`) ?? getMemory(channelInput)
  const resolved = alias ?? channelInput
  const candidates: string[] = []
  const direct = channelPageUrl(resolved)
  // Con alias, @handle o URL el canal es explícito; si solo es un nombre, se verifica el título.
  const explicit = !!alias || !!direct
  if (direct) candidates.push(direct)
  else candidates.push(`https://www.youtube.com/@${resolved.replace(/\s+/g, '')}`)

  let lastError: unknown = new Error('canal no encontrado')
  for (const page of candidates) {
    try {
      const html = await getText(page)
      const id =
        /<meta itemprop="(?:channelId|identifier)" content="(UC[\w-]{22})"/.exec(html)?.[1] ??
        /"externalId":"(UC[\w-]{22})"/.exec(html)?.[1] ??
        /youtube\.com\/channel\/(UC[\w-]{22})/.exec(html)?.[1] ??
        /"channelId":"(UC[\w-]{22})"/.exec(html)?.[1]
      if (!id) throw new Error('sin channelId')
      const xml = await getText(`https://www.youtube.com/feeds/videos.xml?channel_id=${id}`)
      const entry = /<entry>([\s\S]*?)<\/entry>/.exec(xml)?.[1]
      const vid = entry ? /<yt:videoId>([^<]+)<\/yt:videoId>/.exec(entry)?.[1] : undefined
      if (!entry || !vid) throw new Error('sin videos')
      const title = decode(/<title>([^<]*)<\/title>/.exec(entry)?.[1] ?? 'último video')
      const channel = decode(/<author>\s*<name>([^<]*)<\/name>/.exec(xml)?.[1] ?? channelInput)
      if (!explicit && !similarNames(channelInput, channel)) throw new Error('el canal no coincide con el nombre')
      return { channel, title, url: `https://www.youtube.com/watch?v=${vid}` }
    } catch (e) {
      lastError = e
    }
  }
  throw lastError
}

function similarNames(a: string, b: string): boolean {
  const x = normalize(a).replace(/[@ ]/g, '')
  const y = normalize(b).replace(/[@ ]/g, '')
  if (!x || !y) return false
  if (x === y || y.includes(x) || x.includes(y)) return true
  const m = x.length
  const n = y.length
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + (x[i - 1] === y[j - 1] ? 0 : 1))
    }
    prev = cur
  }
  return 1 - (prev[n] ?? 0) / Math.max(m, n) >= 0.7
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}
