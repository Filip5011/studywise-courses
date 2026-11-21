// Electron isn't there on the phone; anything reaching for it is a desktop-only path.
const missing = new Proxy(
  {},
  {
    get: (_t, prop) => {
      if (prop === 'isPackaged') return true
      return () => {
        throw new Error('That needs your computer.')
      }
    }
  }
)
export const app = missing
export const BrowserWindow = missing
export const dialog = missing
export const ipcMain = missing
export const shell = missing
export const net = missing
export const protocol = missing
export const session = missing
export const nativeTheme = missing
export const Notification = missing
export default { app, BrowserWindow, dialog, ipcMain, shell, net, protocol, session, nativeTheme, Notification }
