import type { MobileApi } from '@shared/mobile'

declare global {
  interface Window {
    studywiseMobile?: MobileApi
  }
}

/** The phone app (Capacitor) rather than the desktop app (Electron). */
export const IS_MOBILE = typeof window !== 'undefined' && !!window.studywiseMobile
export const mobile = (): MobileApi => window.studywiseMobile!
