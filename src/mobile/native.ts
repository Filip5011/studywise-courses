// Phone integration (Android and iPhone): the back button (Android only), the
// status bar, saving when the app goes to the background and syncing when it
// comes back. On iPhone the status bar always sits over the page (the layout
// leaves room with the safe-area insets) and the Android-only calls just fail.

import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { StatusBar, Style } from '@capacitor/status-bar'
import { saveNow } from './db'
import { syncNow } from './phoneSync'

export function setupNative(): void {
  if (!Capacitor.isNativePlatform()) return

  // Back: close whatever's open (a dialog, the menu, Explain), else go back a page, else leave the app.
  void App.addListener('backButton', async () => {
    const modal = document.querySelector('[data-modal]')
    if (modal) {
      modal.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      return
    }
    const { useStore } = await import('../renderer/src/lib/store')
    const st = useStore.getState()
    if (st.explain) return st.openExplain(null)
    if (st.back.length) return st.goBack()
    if (st.route.name !== 'home') return st.go({ name: 'home' })
    void App.minimizeApp()
  })

  void App.addListener('pause', () => void saveNow())
  void App.addListener('resume', () => void syncNow())

  // Status bar follows the app's light/dark theme.
  const paint = () => {
    const dark = document.documentElement.classList.contains('dark')
    void StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => {})
    void StatusBar.setBackgroundColor({ color: dark ? '#0b0e14' : '#f8f9fb' }).catch(() => {})
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0b0e14' : '#f8f9fb')
  }
  void StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {})
  paint()
  new MutationObserver(paint).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
}
