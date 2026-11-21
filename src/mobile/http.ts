// HTTP for talking to the computer. In the Android app this goes through
// Capacitor's native HTTP: the page is served from https://localhost, and a
// WebView won't fetch plain http:// LAN addresses from a secure page.

import { Capacitor, CapacitorHttp } from '@capacitor/core'
import type { HttpFn, HttpResponse } from '../main/sync/client'

const b64ToBytes = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
export function bytesToB64(b: Uint8Array): string {
  let s = ''
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000))
  return btoa(s)
}

const nativeHttp: HttpFn = async ({ method, url, headers = {}, body, timeoutMs = 30_000 }) => {
  const binary = method === 'GET' && url.includes('/file?')
  const r = await CapacitorHttp.request({
    method,
    url,
    headers,
    data: typeof body === 'string' ? JSON.parse(body) : body,
    responseType: binary ? 'arraybuffer' : 'json',
    connectTimeout: Math.min(timeoutMs, 8000),
    readTimeout: timeoutMs
  })
  const res: HttpResponse = {
    status: r.status,
    json: async () => (typeof r.data === 'string' ? JSON.parse(r.data || '{}') : r.data),
    bytes: async () => (typeof r.data === 'string' ? b64ToBytes(r.data) : new Uint8Array(r.data as ArrayBuffer))
  }
  return res
}

const webHttp: HttpFn = async ({ method, url, headers, body, timeoutMs = 30_000 }) => {
  const res = await fetch(url, { method, headers, body: body as BodyInit | undefined, signal: AbortSignal.timeout(timeoutMs) })
  const buf = new Uint8Array(await res.arrayBuffer())
  return { status: res.status, json: async () => JSON.parse(new TextDecoder().decode(buf) || '{}'), bytes: async () => buf }
}

export const http: HttpFn = Capacitor.isNativePlatform() ? nativeHttp : webHttp
export const isNative = Capacitor.isNativePlatform()
