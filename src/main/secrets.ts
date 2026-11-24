// Keys (Ollama's, the marketplace's) are kept in settings under secret.*,
// encrypted with the OS keychain (DPAPI on Windows) when it's available.
// secret.* settings never go to the page.

import { getSetting, setSetting } from './db/repo'

type SafeStorage = { isEncryptionAvailable(): boolean; encryptString(s: string): Buffer; decryptString(b: Buffer): string }
function safeStorage(): SafeStorage | null {
  try {
    // Not available when running as plain Node (unit tests).
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const s = (require('electron') as { safeStorage?: SafeStorage }).safeStorage
    return s && s.isEncryptionAvailable() ? s : null
  } catch {
    return null
  }
}

export function setSecret(key: `secret.${string}`, value: string | null): void {
  const v = value?.trim()
  if (!v) return setSetting(key, null)
  const ss = safeStorage()
  setSetting(key, ss ? { enc: ss.encryptString(v).toString('base64') } : { plain: v })
}

export function getSecret(key: `secret.${string}`): string | null {
  const v = getSetting<{ enc?: string; plain?: string } | null>(key, null)
  if (v?.enc) {
    try {
      return safeStorage()?.decryptString(Buffer.from(v.enc, 'base64')) ?? null
    } catch {
      return null // encrypted on another computer (restored backup)
    }
  }
  return v?.plain ?? null
}

export const hasStoredSecret = (key: `secret.${string}`): boolean => !!getSetting(key, null)
