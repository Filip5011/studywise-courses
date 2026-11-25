// electron-builder config. Signing + notarization only happen when the
// relevant env vars are present; otherwise the build is ad-hoc signed
// (fine for personal use, see README for first launch).
const hasCert = !!(process.env.CSC_LINK || process.env.CSC_NAME)
const canNotarize =
  hasCert && !!process.env.APPLE_ID && !!process.env.APPLE_TEAM_ID && !!(process.env.APPLE_APP_SPECIFIC_PASSWORD || process.env.APPLE_ID_PASSWORD)

if (process.env.APPLE_ID_PASSWORD && !process.env.APPLE_APP_SPECIFIC_PASSWORD) process.env.APPLE_APP_SPECIFIC_PASSWORD = process.env.APPLE_ID_PASSWORD

console.log(`[studywise] signing: ${hasCert ? 'Developer ID' : 'ad-hoc (no certificate)'} · notarize: ${canNotarize ? 'yes' : 'no'}`)

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'com.studywise.courses',
  productName: 'Studywise Courses',
  copyright: 'Studywise',
  directories: { output: 'release', buildResources: 'build' },
  files: ['out/**/*', 'resources/**/*', 'package.json', '!**/*.map'],
  asarUnpack: ['resources/**', '**/*.node'],
  // better-sqlite3 ships Node-API prebuilds for every platform, so nothing needs compiling.
  npmRebuild: false,
  // Where installed builds look for updates (electron-updater reads latest.yml /
  // latest-mac.yml from the newest release). Builds never publish by themselves:
  // scripts/release.sh uploads the files.
  publish: [{ provider: 'github', owner: 'SnakeLuck360GT', repo: 'studywise-courses', releaseType: 'release' }],
  mac: {
    category: 'public.app-category.education',
    artifactName: 'Studywise-Courses-mac.${ext}',
    icon: 'build/icon.icns',
    target: [
      { target: 'dmg', arch: ['universal'] },
      { target: 'zip', arch: ['universal'] }
    ],
    minimumSystemVersion: '12.0',
    darkModeSupport: true,
    hardenedRuntime: hasCert,
    gatekeeperAssess: false,
    identity: hasCert ? undefined : '-',
    entitlements: hasCert ? 'build/entitlements.mac.plist' : undefined,
    entitlementsInherit: hasCert ? 'build/entitlements.mac.plist' : undefined,
    notarize: canNotarize,
    mergeASARs: true,
    x64ArchFiles: '**/*.node',
    extendInfo: {
      NSHumanReadableCopyright: 'Studywise',
      LSApplicationCategoryType: 'public.app-category.education'
    }
  },
  win: {
    icon: 'build/icon.ico',
    target: [
      { target: 'nsis', arch: ['x64'] },
      { target: 'zip', arch: ['x64'] }
    ],
    artifactName: 'Studywise-Courses-win-${arch}.${ext}'
  },
  nsis: {
    // Running the installer again updates in place: same appId, so it replaces
    // the old version (in whatever folder it was installed to) and leaves
    // %APPDATA%\Studywise Courses alone, even when the old version's
    // uninstaller runs as part of the update. Never set this to true.
    deleteAppDataOnUninstall: false,
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'Studywise Courses',
    artifactName: 'Studywise-Courses-Setup.${ext}'
  },
  fileAssociations: [
    { ext: 'pdf', name: 'PDF Document', role: 'Viewer', rank: 'Alternate' },
    { ext: 'docx', name: 'Word Document', role: 'Viewer', rank: 'Alternate' },
    { ext: 'pptx', name: 'PowerPoint Presentation', role: 'Viewer', rank: 'Alternate' },
    { ext: 'apkg', name: 'Anki Deck Package', role: 'Viewer', rank: 'Alternate' },
    { ext: 'studyweek', name: 'Shared Studywise Week', role: 'Editor', rank: 'Owner' }
  ],
  // Lock down Electron: the app can't be run as plain Node or be driven via
  // NODE_OPTIONS. STUDYWISE_DEBUG_BUILD=1 keeps --inspect for automated checks.
  electronFuses: {
    runAsNode: false,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: !!process.env.STUDYWISE_DEBUG_BUILD,
    onlyLoadAppFromAsar: true,
    enableCookieEncryption: true
  },
  dmg: {
    artifactName: 'Studywise-Courses.${ext}',
    title: 'Studywise Courses',
    contents: [
      { x: 150, y: 190, type: 'file' },
      { x: 390, y: 190, type: 'link', path: '/Applications' }
    ],
    window: { width: 540, height: 380 }
  }
}
