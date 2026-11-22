// The iPhone app icon: build/icon.svg's design, but full-bleed (iOS rounds the
// corners itself) and with no transparency (iOS turns it black). Run: npm run icons:ios
const { app, BrowserWindow } = require('electron')
const { readFileSync, writeFileSync, mkdtempSync, rmSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const { execFileSync } = require('node:child_process')

const root = join(__dirname, '..')
const out = join(root, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png')

// Same colours and cards; the 824px rounded square becomes the whole 1024px icon,
// so everything inside scales by 1024/824 around the centre.
const desktop = readFileSync(join(root, 'build/icon.svg'), 'utf8')
const background = desktop.match(/<rect x="100"[^>]*fill="([^"]+)"/)[1]
const cards = desktop.match(/<g transform="translate\(27 12\)">[\s\S]*?<\/g>/)[0]
const scale = 1024 / 824
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <rect width="1024" height="1024" fill="${background}"/>
  <g transform="translate(512 512) scale(${scale}) translate(-512 -512)">${cards}</g>
</svg>`

app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1024, height: 1024, show: false, frame: false, useContentSize: true, backgroundColor: background, webPreferences: { offscreen: true } })
  win.webContents.setFrameRate(1)
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<html><body style="margin:0;background:${background}">${svg}</body></html>`))
  await new Promise((r) => setTimeout(r, 600))
  const img = (await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 })).resize({ width: 1024, height: 1024 })
  // Via JPEG to drop the alpha channel the App Store won't accept, then back to PNG.
  const dir = mkdtempSync(join(tmpdir(), 'ios-icon-'))
  const jpg = join(dir, 'icon.jpg')
  writeFileSync(jpg, img.toJPEG(100))
  execFileSync('sips', ['-s', 'format', 'png', jpg, '--out', out], { stdio: 'ignore' })
  rmSync(dir, { recursive: true, force: true })
  console.log(`wrote ${out}`)
  app.quit()
})
