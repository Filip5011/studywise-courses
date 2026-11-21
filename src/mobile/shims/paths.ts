// The phone keeps no files on disk for the desktop code; these are just names.
export const paths = {
  userData: '/studywise',
  db: '/studywise/studywise.db',
  attachments: '/studywise/attachments',
  courses: '/studywise/courses',
  cache: '/studywise/cache',
  logs: '/studywise/logs',
  backups: '/studywise/backups',
  lastVersion: '/studywise/last-version',
  windowState: '/studywise/window-state.json'
}
export function initPaths(): void {}
