// The phone app's entry: open the local library, install window.studywise,
// then start the same React app the desktop uses.

import './mobile.css'
import { initMobileDb } from './db'
import { installBackend } from './backend'
import { startAutoSync } from './phoneSync'
import { persistStorage } from './idb'
import { setupNative } from './native'

async function boot() {
  document.documentElement.classList.add('is-mobile', 'is-win')
  persistStorage()
  await initMobileDb()
  installBackend()
  setupNative()
  startAutoSync()
  // The app reads window.studywise when its modules load, so import it now.
  const [{ StrictMode, createElement }, { createRoot }, { App }] = await Promise.all([import('react'), import('react-dom/client'), import('../renderer/src/App')])
  createRoot(document.getElementById('root')!).render(createElement(StrictMode, null, createElement(App)))
}

boot().catch((e) => {
  document.body.innerHTML = `<pre style="padding:24px;white-space:pre-wrap;font:14px system-ui">Studywise couldn’t start:\n${(e as Error)?.stack ?? e}</pre>`
})
