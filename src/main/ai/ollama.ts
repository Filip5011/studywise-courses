// Ollama (cloud or local) as an alternative to the Claude Code CLI.
//
// Every call is a streamed POST to {baseUrl}/api/chat. Ollama Cloud is
// https://ollama.com with an API key; a local server (http://localhost:11434)
// needs no key and can also run "-cloud" models when signed in.
//
// The result is shaped like a Claude CLI result so runAI() treats both alike.
// Differences handled here:
//   - no tools: source files are read in the app and sent as text, and PDFs
//     with no text layer go in as page images when the model has vision
//   - sessions (auto-continue) are kept in memory as message histories
//   - cloud models don't support structured outputs, so JSON tasks rely on the
//     schema in the prompt plus the zod check and retry in runAI()

import { randomUUID } from 'node:crypto'
import { basename, extname } from 'node:path'
import { readFileSync } from 'node:fs'
import type { AiLiveEvent, CliResult } from './cli'
import { CliError } from './cli'
import { getSetting, setSetting } from '../db/repo'
import { getSecret, hasStoredSecret, setSecret } from '../secrets'
import type { OllamaModel, OllamaStatus } from '@shared/types'

export const OLLAMA_CLOUD_URL = 'https://ollama.com'
const KEY_SETTING = 'secret.ollamaKey' as const

// ---------------------------------------------------------------------------
// Config and API key

export function ollamaBaseUrl(): string {
  const raw = getSetting<string>('ollama.baseUrl', OLLAMA_CLOUD_URL).trim() || OLLAMA_CLOUD_URL
  return raw.replace(/\/+$/, '').replace(/\/api$/, '')
}

export function isCloudUrl(url = ollamaBaseUrl()): boolean {
  try {
    return /(^|\.)ollama\.com$/i.test(new URL(url).hostname)
  } catch {
    return false
  }
}

/** The key is encrypted with the OS keychain (DPAPI on Windows) when possible. */
export function setOllamaKey(key: string | null): void {
  setSecret(KEY_SETTING, key)
}

export function getOllamaKey(): string | null {
  return getSecret(KEY_SETTING) ?? (hasStoredSecret(KEY_SETTING) ? null : process.env.OLLAMA_API_KEY?.trim() || null)
}

export function ollamaStatus(): OllamaStatus {
  const baseUrl = ollamaBaseUrl()
  const hasKey = !!getOllamaKey()
  const cloud = isCloudUrl(baseUrl)
  return {
    baseUrl,
    cloud,
    hasKey,
    keyFromEnv: hasKey && !getSetting(KEY_SETTING, null),
    ready: cloud ? hasKey : true,
    defaultModel: getSetting<string>('ollama.defaultModel', ''),
    saved: getSetting<string[]>('ollama.savedModels', [])
  }
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  const key = getOllamaKey()
  if (key) h.Authorization = `Bearer ${key}`
  return h
}

// ---------------------------------------------------------------------------
// Model list

let modelCache: { at: number; url: string; models: OllamaModel[] } | null = null

export async function listOllamaModels(force = false): Promise<OllamaModel[]> {
  const url = ollamaBaseUrl()
  if (!force && modelCache && modelCache.url === url && Date.now() - modelCache.at < 10 * 60_000) return modelCache.models
  if (process.env.AI_MOCK === '1') {
    const models: OllamaModel[] = [
      { name: 'gpt-oss:120b', capabilities: ['completion', 'thinking'], size: 0, modified_at: null },
      { name: 'qwen3-vl:235b', capabilities: ['completion', 'vision'], size: 0, modified_at: null }
    ]
    modelCache = { at: Date.now(), url, models }
    return models
  }
  let res: Response
  try {
    res = await fetch(`${url}/api/tags`, { headers: headers(), signal: AbortSignal.timeout(20_000) })
  } catch (e) {
    throw new CliError(`Couldn't reach Ollama at ${url}: ${(e as Error).message}`, 'failed')
  }
  if (!res.ok) throw new CliError(await httpError(res, url), res.status === 401 || res.status === 403 ? 'failed' : 'transient')
  const body = (await res.json()) as { models?: { name?: string; model?: string; capabilities?: string[]; size?: number; modified_at?: string }[] }
  const models = (body.models ?? [])
    .map((m) => ({ name: m.name || m.model || '', capabilities: m.capabilities ?? [], size: m.size ?? 0, modified_at: m.modified_at ?? null }))
    .filter((m) => m.name)
    .sort((a, b) => a.name.localeCompare(b.name))
  modelCache = { at: Date.now(), url, models }
  return models
}

async function modelHasVision(model: string): Promise<boolean> {
  try {
    const m = (await listOllamaModels()).find((x) => x.name === model || x.name === `${model}:latest`)
    return !!m?.capabilities.includes('vision')
  } catch {
    return false
  }
}

async function httpError(res: Response, url: string): Promise<string> {
  let detail = ''
  try {
    const t = await res.text()
    try {
      detail = (JSON.parse(t) as { error?: string }).error ?? t
    } catch {
      detail = t
    }
  } catch {
    /* ignore */
  }
  detail = detail.trim().slice(0, 400)
  if (res.status === 401 || res.status === 403)
    return isCloudUrl(url) ? 'Ollama rejected the API key. Check it in Settings → AI provider (create one at ollama.com/settings/keys).' : `Ollama refused the request (${res.status}). ${detail}`
  if (res.status === 404) return `Ollama doesn't have that model${detail ? `: ${detail}` : ''}. Pick another in Settings → Models${isCloudUrl(url) ? '' : ', or pull it with `ollama pull`'}.`
  if (res.status === 429) return `Ollama rate limit reached${detail ? `: ${detail}` : ''}`
  return `Ollama returned ${res.status}${detail ? `: ${detail}` : ''}`
}

// ---------------------------------------------------------------------------
// Source files → text (and page images for scanned PDFs)

const MAX_IMAGE_PAGES = 24

export async function filesForOllama(files: string[], vision: boolean): Promise<{ text: string; images: string[] }> {
  const blocks: string[] = []
  const images: string[] = []
  for (const f of files) {
    const name = basename(f)
    if (extname(f).toLowerCase() === '.pdf') {
      const { PDFParse } = await import('pdf-parse')
      const parser = new PDFParse({ data: readFileSync(f) })
      try {
        const pages = (await parser.getText()).pages
        const chars = pages.reduce((n, p) => n + p.text.trim().length, 0)
        if (chars >= pages.length * 20) {
          blocks.push(`<file name="${name}">\n${pages.map((p) => `[page ${p.num}]\n${p.text.trim()}`).join('\n\n')}\n</file>`)
          continue
        }
        if (!vision)
          throw new CliError(`${name} is a scanned PDF with no text in it. Pick an Ollama model with vision (it shows a "vision" tag in Settings → Models) to read it from images.`, 'failed')
        const count = Math.min(pages.length, MAX_IMAGE_PAGES)
        const shot = await parser.getScreenshot({ partial: Array.from({ length: count }, (_, i) => i + 1), desiredWidth: 1200, imageBuffer: true, imageDataUrl: false })
        const first = images.length + 1
        for (const p of shot.pages) if (p.data) images.push(Buffer.from(p.data).toString('base64'))
        blocks.push(
          `<file name="${name}">\n(${count} scanned page${count > 1 ? 's' : ''}, attached as images ${first}–${images.length} in page order${pages.length > count ? `; only the first ${count} of ${pages.length} pages fit` : ''}.)\n</file>`
        )
      } finally {
        await parser.destroy()
      }
    } else if (['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(extname(f).toLowerCase())) {
      // A picture of a slide or the whiteboard: only a vision model can read it.
      if (!vision) throw new CliError(`${name} is a picture. Pick an Ollama model with vision (it shows a "vision" tag in Settings → Models) to read it.`, 'failed')
      images.push(readFileSync(f).toString('base64'))
      blocks.push(`<file name="${name}">\n(A picture, attached as image ${images.length}.)\n</file>`)
    } else {
      const { extractText } = await import('../files')
      blocks.push(`<file name="${name}">\n${await extractText(f)}\n</file>`)
    }
  }
  return { text: blocks.join('\n\n'), images }
}

// ---------------------------------------------------------------------------
// Chat

interface Msg {
  role: 'system' | 'user' | 'assistant'
  content: string
  images?: string[]
}

/** In-memory histories for auto-continue ("resume"). Small LRU. */
const sessions = new Map<string, Msg[]>()
function keepSession(id: string, msgs: Msg[]): void {
  sessions.delete(id)
  sessions.set(id, msgs)
  while (sessions.size > 40) sessions.delete(sessions.keys().next().value!)
}

export interface OllamaRequest {
  prompt: string
  system?: string
  model: string
  effort?: string | null
  jsonSchema?: object
  onDelta?: (text: string) => void
  /** Live progress (thinking, file reads, output) for the jobs panel. */
  onEvent?: (e: AiLiveEvent) => void
  files?: string[]
  resume?: string
  persistSession?: boolean
  timeoutMs: number
  signal?: AbortSignal
}

/** Map an effort level to Ollama's `think` option. */
export function thinkFor(model: string, effort?: string | null): boolean | 'low' | 'medium' | 'high' | undefined {
  if (!effort) return undefined
  if (effort === 'off') return false
  const level = effort === 'low' ? 'low' : effort === 'medium' ? 'medium' : 'high'
  // gpt-oss takes a level; other thinking models take true/false.
  return /gpt-oss/i.test(model) ? level : true
}

/** Hide <think>…</think> blocks that some models write inline. Holds back a
 * partial tag at the end so it never flashes up while streaming. */
export function visibleText(raw: string): string {
  let t = raw.replace(/<think>[\s\S]*?<\/think>\s*/g, '')
  const open = t.indexOf('<think>')
  if (open !== -1) t = t.slice(0, open)
  for (let k = Math.min(6, t.length); k > 0; k--) {
    if ('<think>'.startsWith(t.slice(-k))) {
      t = t.slice(0, -k)
      break
    }
  }
  return t
}

export async function runOllama(req: OllamaRequest): Promise<CliResult> {
  const url = ollamaBaseUrl()
  if (isCloudUrl(url) && !getOllamaKey()) throw new CliError('Add your Ollama API key in Settings → AI provider first (create one at ollama.com/settings/keys).', 'failed')
  if (!req.model) throw new CliError('Choose an Ollama model in Settings → Models first.', 'failed')

  let messages: Msg[]
  if (req.resume) {
    const prev = sessions.get(req.resume)
    if (!prev) throw new CliError('That Ollama session has expired', 'failed')
    messages = [...prev, { role: 'user', content: req.prompt }]
  } else {
    messages = []
    if (req.system) messages.push({ role: 'system', content: req.system })
    let content = req.prompt
    let images: string[] = []
    if (req.files?.length) {
      for (const f of req.files) req.onEvent?.({ kind: 'read', file: basename(f) })
      const src = await filesForOllama(req.files, await modelHasVision(req.model))
      content += `\n\n${src.text}`
      images = src.images
    }
    messages.push(images.length ? { role: 'user', content, images } : { role: 'user', content })
  }

  const cloudModel = isCloudUrl(url) || /-cloud$/i.test(req.model)
  const body: Record<string, unknown> = { model: req.model, messages, stream: true }
  const think = thinkFor(req.model, req.effort)
  if (think !== undefined) body.think = think
  // Local models: structured output works and the default context is small.
  if (!cloudModel) {
    if (req.jsonSchema && !req.resume) body.format = req.jsonSchema
    body.options = { num_ctx: getSetting<number>('ollama.numCtx', 32768) }
  }

  const sessionId = req.resume ?? randomUUID()
  const ctl = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    ctl.abort()
  }, req.timeoutMs)
  const onAbort = () => ctl.abort()
  if (req.signal?.aborted) ctl.abort()
  req.signal?.addEventListener('abort', onAbort)

  const fail = (e: unknown): never => {
    if (e instanceof CliError) throw e
    if (req.signal?.aborted) throw new CliError('Cancelled', 'cancelled')
    if (timedOut) throw new CliError(`Ollama took longer than ${Math.round(req.timeoutMs / 1000)}s and was stopped`, 'timeout')
    const msg = (e as Error)?.message ?? String(e)
    const cause = ((e as { cause?: { code?: string } })?.cause?.code ?? '') as string
    if (/ECONNREFUSED|ENOTFOUND|EAI_AGAIN/.test(cause) && !isCloudUrl(url)) throw new CliError(`Couldn't reach Ollama at ${url}. Is it running?`, 'failed')
    throw new CliError(`Ollama request failed: ${msg}${cause ? ` (${cause})` : ''}`, 'transient')
  }

  try {
    let res: Response
    try {
      res = await fetch(`${url}/api/chat`, { method: 'POST', headers: headers(), body: JSON.stringify(body), signal: ctl.signal })
    } catch (e) {
      return fail(e)
    }
    if (!res.ok) {
      const msg = await httpError(res, url)
      // Models without thinking reject `think`; try once without it.
      if (res.status === 400 && body.think !== undefined && /think/i.test(msg)) {
        clearTimeout(timer)
        req.signal?.removeEventListener('abort', onAbort)
        return runOllama({ ...req, effort: null })
      }
      throw new CliError(msg, res.status === 429 || res.status >= 500 ? 'transient' : 'failed')
    }

    let raw = ''
    let emitted = 0
    let lineBuf = ''
    let final: { done_reason?: string; prompt_eval_count?: number; eval_count?: number } | null = null
    const handle = (line: string) => {
      if (!line.trim()) return
      let ev: { message?: { content?: string; thinking?: string }; done?: boolean; done_reason?: string; prompt_eval_count?: number; eval_count?: number; error?: string }
      try {
        ev = JSON.parse(line)
      } catch {
        return
      }
      if (ev.error) throw new CliError(`Ollama: ${ev.error}`, /overload|rate|capacity|unavailable/i.test(ev.error) ? 'transient' : 'failed')
      // With `think`, Ollama sends the reasoning separately from the reply.
      if (ev.message?.thinking) req.onEvent?.({ kind: 'thinking', text: ev.message.thinking })
      const piece = ev.message?.content
      if (piece) {
        raw += piece
        if (req.onDelta || req.onEvent) {
          const vis = visibleText(raw)
          if (vis.length > emitted) {
            const delta = vis.slice(emitted)
            req.onDelta?.(delta)
            req.onEvent?.({ kind: 'output', text: delta })
            emitted = vis.length
          } else if (raw.length > vis.length) req.onEvent?.({ kind: 'thinking' }) // inside an inline <think> block
        }
      }
      if (ev.done) final = ev
    }
    try {
      const decoder = new TextDecoder()
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        lineBuf += decoder.decode(chunk, { stream: true })
        let i: number
        while ((i = lineBuf.indexOf('\n')) !== -1) {
          handle(lineBuf.slice(0, i))
          lineBuf = lineBuf.slice(i + 1)
        }
      }
      if (lineBuf) handle(lineBuf)
    } catch (e) {
      return fail(e)
    }

    const text = visibleText(raw).trim()
    if (text.length > emitted) {
      req.onDelta?.(text.slice(emitted))
      req.onEvent?.({ kind: 'output', text: text.slice(emitted) })
    }
    const done = final as { done_reason?: string; prompt_eval_count?: number; eval_count?: number } | null
    if (req.persistSession || req.resume) keepSession(sessionId, [...messages, { role: 'assistant', content: raw }])
    return {
      text,
      structured: null,
      sessionId,
      stopReason: done?.done_reason === 'length' ? 'max_tokens' : 'end_turn',
      isError: false,
      inputTokens: done?.prompt_eval_count ?? null,
      outputTokens: done?.eval_count ?? null,
      costUsd: null,
      workDir: '',
      raw: raw.slice(-20000)
    }
  } finally {
    clearTimeout(timer)
    req.signal?.removeEventListener('abort', onAbort)
  }
}
